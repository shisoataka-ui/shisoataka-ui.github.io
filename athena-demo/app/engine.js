// Athena public demo - smartphone light edition matching engine.
//
// This is an independent, deliberately simple matcher written for
// the smartphone edition: character n-gram TF-IDF retrieval over
// the demo's dummy KB, a coverage gate, and the demo's restriction
// layer (personal information / operating organisation / school
// topics). It is NOT the ATHENA 2.0 engine: no 2.0 code, weights,
// jury models or configuration are included or reproduced here.
// The PC edition (full version) is the one that runs the real
// engine; this page is labelled as the light edition on screen.
"use strict";

// ---------------------------------------------------------------------
// text utilities (normalisation, affix stripping, n-grams, TF-IDF)
// ---------------------------------------------------------------------
var _WS = /\s+/g;
var _PUNCT = /[。、・！？!?.,，…「」『』（）()\[\]"'’]/g;

var _PREFIXES = [
"おはようございます", "こんにちは", "こんばんは", "はじめまして",
"すみません", "すいません", "しつもんですが", "質問ですが",
"おしえてください", "教えてください", "おしえて", "教えて",
"あのう", "あの", "えっと", "ちょっと聞きたいのですが",
"ちょっと", "ねえ", "もしもし"
];
var _SUFFIXES = [
"について教えてください", "についておしえてください",
"を教えてください", "をおしえてください",
"について教えて", "についておしえて", "を教えて", "をおしえて",
"って何ですか", "とは何ですか", "ってなんですか",
"は何ですか", "はなんですか", "ですか", "ますか",
"はどれくらい", "どれくらい", "はどのくらい", "どのくらい",
"みたいなんですけど", "なんですけど", "んですけど", "んです",
"って何", "とは何", "は何", "でしょうか", "かな",
"？", "?", "。", "！", "!"
];

function normalizeText(text) {
var t = (text || "").toLowerCase();
t = t.replace(_WS, "");
t = t.replace(_PUNCT, "");
return t;
}

function stripAffixes(text) {
var t = normalizeText(text);
var changed = true;
while (changed) {
changed = false;
for (var i = 0; i < _PREFIXES.length; i++) {
var p = _PREFIXES[i];
if (t.indexOf(p) === 0) { t = t.slice(p.length); changed = true;}
}
for (var j = 0; j < _SUFFIXES.length; j++) {
var s = _SUFFIXES[j];
if (t.length > s.length && t.slice(t.length - s.length) === s) {
t = t.slice(0, t.length - s.length);
changed = true;
}
}
}
if (t.length > 3 && t.indexOf("って") >= 0) {
t = t.split("って").join("");
}
return t;
}

function ngrams(text, sizes) {
sizes = sizes || [2, 3];
var grams = [];
for (var k = 0; k < sizes.length; k++) {
var size = sizes[k];
if (text.length >= size) {
for (var i = 0; i <= text.length - size; i++) {
grams.push(text.slice(i, i + size));
}
}
}
if (!grams.length && text) grams.push(text);
return grams;
}

function counterOf(text) {
var grams = ngrams(text);
var c = new Map();
grams.forEach(function(g) { c.set(g, (c.get(g) || 0) + 1);});
return c;
}

function TfidfIndex(docs) {
this.docCount = docs.length;
var df = new Map();
var counters = [];
docs.forEach(function(d) {
var c = counterOf(d);
counters.push(c);
c.forEach(function(_, g) { df.set(g, (df.get(g) || 0) + 1);});
});
var n = Math.max(this.docCount, 1);
this.idf = new Map();
var self = this;
df.forEach(function(d, g) {
self.idf.set(g, Math.log((n + 1) / (d + 1)) + 1.0);
});
this.vectors = counters.map(function(c) { return self._vectorize(c);});
}
TfidfIndex.prototype._vectorize = function(counter) {
var vec = new Map();
var normSq = 0.0;
var idf = this.idf;
counter.forEach(function(cnt, g) {
var w = (1.0 + Math.log(cnt)) * (idf.has(g)? idf.get(g): 1.0);
vec.set(g, w);
normSq += w * w;
});
var norm = Math.sqrt(normSq) || 1.0;
vec.forEach(function(w, g) { vec.set(g, w / norm);});
return vec;
};
TfidfIndex.prototype.vectorizeText = function(text) {
return this._vectorize(counterOf(text));
};
TfidfIndex.cosine = function(a, b) {
if (a.size > b.size) { var tmp = a; a = b; b = tmp;}
var sum = 0.0;
a.forEach(function(w, g) { sum += w * (b.get(g) || 0.0);});
return sum;
};

// ---------------------------------------------------------------------
// restriction layer: personal information / organisation / school
// ---------------------------------------------------------------------
var _RULES = [
["personal", {
keywords: ["電話番号", "携帯番号", "メールアドレス", "住所", "連絡先",
"自宅", "本名", "実名", "個人情報", "マイナンバー",
"生年月日", "血液型", "パスワード"],
patterns: [/0\d{1,4}[-]?\d{1,4}[-]?\d{4}/,
/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/]
}],
["org", { keywords: ["tct", "ティーシーティー"], patterns: []}],
["school", {
keywords: ["学校", "がっこう", "立命館", "りつめいかん",
"小学校", "中学校", "高校", "高等学校", "大学",
"担任", "学年"],
patterns: []
}]
];
var _EXEMPLARS = [
["personal", ["あの人の電話番号を知りたい",
"友達の家はどこにありますか",
"あの子の連絡先を教えてください",
"有名人の自宅の住所はどこですか",
"あの人の本名を教えて"]],
["org", ["その団体のメンバーは誰ですか",
"団体の内部資料を見せてください",
"その団体の今後の予定を教えて",
"団体の運営について知りたい"]],
["school", ["学校の予定を教えてください",
"学校の先生は誰ですか",
"学校行事の日程を知りたい",
"学校の内部の決まりを教えて"]]
];
var REFUSALS = {
personal: "すみませんが、個人情報に関するご質問にはお答えできません。" +
"工作や科学のことでしたら、お気軽に聞いてください。",
org: "すみませんが、運営に関する内部のご質問にはお答えできません。" +
"工作や科学のことでしたら、お気軽に聞いてください。",
school: "すみませんが、学校に関するご質問にはお答えできません。" +
"工作や科学のことでしたら、お気軽に聞いてください。"
};
var COV_THRESHOLD = 0.60;

var _exemplarGrams = [];
_EXEMPLARS.forEach(function(pair) {
pair[1].forEach(function(ph) {
_exemplarGrams.push([pair[0], new Set(ngrams(stripAffixes(ph)))]);
});
});

function restrictionCheck(rawText) {
var t = normalizeText(rawText);
for (var i = 0; i < _RULES.length; i++) {
var cat = _RULES[i][0], rule = _RULES[i][1];
for (var j = 0; j < rule.keywords.length; j++) {
if (t.indexOf(rule.keywords[j]) >= 0) return cat;
}
for (var k = 0; k < rule.patterns.length; k++) {
if (rule.patterns[k].test(t)) return cat;
}
}
var qgrams = new Set(ngrams(stripAffixes(rawText)));
if (!qgrams.size) return null;
var bestCov = 0.0, bestCat = null;
_exemplarGrams.forEach(function(pair) {
var hit = 0;
qgrams.forEach(function(g) { if (pair[1].has(g)) hit++;});
var cov = hit / qgrams.size;
if (cov > bestCov) { bestCov = cov; bestCat = pair[0];}
});
if (bestCat!== null && bestCov >= COV_THRESHOLD) return bestCat;
return null;
}

// ---------------------------------------------------------------------
// PII screening for collected records (intake-side flags only)
// ---------------------------------------------------------------------
var _PII_PATTERNS = [
["phone", /0\d{1,4}[-]?\d{1,4}[-]?\d{4}|\d{10,11}/],
["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
["postal", /〒?\s?\d{3}[-]\d{4}/],
["name_like", /[一-龥ぁ-んァ-ヶ]{2,5}(さん|くん|ちゃん|君|先生|様|氏)|(氏名|名前|なまえ)[：:は]\s*\S+/],
["address_like", /(都|道|府|県).{1,10}(市|区|町|村).{0,15}\d/]
];
function piiScreenText(text) {
if (!text) return [];
var flags = [];
_PII_PATTERNS.forEach(function(pair) {
if (pair[1].test(text)) flags.push(pair[0]);
});
return flags.sort();
}
function piiScreenRecord(fields) {
var out = {};
Object.keys(fields).forEach(function(field) {
var flags = piiScreenText(fields[field]);
if (flags.length) out[field] = flags;
});
return out;
}

// ---------------------------------------------------------------------
// light matcher: TF-IDF retrieval over the dummy KB with a coverage
// gate; close calls are asked back as choices, anything else
// abstains honestly instead of guessing.
// ---------------------------------------------------------------------
var ANSWER_SIM = 0.30;   // minimum similarity to consider answering
var HIGH_CONF = 0.52;    // similarity that answers even with a rival
var CLARIFY_BAND = 0.10; // rivals within this band are asked back
var COV_MIN = 0.50;      // share of the query's 2-grams the best
                         // pattern must cover

var _GREETINGS = new Set([
  "こんにちは", "おはよう", "おはようございます", "こんばんは",
  "ありがとう", "ありがとうございます", "おつかれさま",
  "お疲れさま", "はじめまして", "やあ", "ハロー", "hello", "hi"
]);
var GREETING_REPLY = "こんにちは！ 工作や科学のことなら何でも聞いてください。" +
  "たとえば「3Dプリンターって何？」「コマが倒れないのはなぜ？」のように聞けます。";
var ABSTAIN_REPLY = "すみません、その質問には今の知識ではお答えできませんでした。" +
  "よければ、下の欄に「何を知りたかったか」を書いてください。" +
  "今後の改善に使わせていただきます。";

var _LABEL_TRIM = /(とは何ですか|って何ですか|とは何|って何|を教えてください|について教えてください|は何ですか|はなぜですか|の理由は|を教えて|について教えて|は何|ですか|とは|って)[？?]*$/;
function choiceLabel(item) {
  var pat = item.q[0];
  var label = pat.replace(_LABEL_TRIM, "").replace(/^[？?。 ]+|[？?。 ]+$/g, "");
  return label || pat;
}

function round4(x) { return Math.round(x * 10000) / 10000; }

function LightEngine(items) {
  this.items = items;
  var docs = [];
  this._docItem = [];
  for (var i = 0; i < items.length; i++) {
    for (var j = 0; j < items[i].q.length; j++) {
      docs.push(stripAffixes(items[i].q[j]));
      this._docItem.push(i);
    }
  }
  this._index = new TfidfIndex(docs);
  this._patternGrams = items.map(function(item) {
    var grams = new Set();
    item.q.forEach(function(pat) {
      ngrams(stripAffixes(pat), [2]).forEach(function(g) { grams.add(g); });
    });
    return grams;
  });
}
LightEngine.prototype._coverage = function(strippedQuery, itemIdx) {
  var qgrams = new Set(ngrams(strippedQuery, [2]));
  if (!qgrams.size) return 0.0;
  var hit = 0;
  var grams = this._patternGrams[itemIdx];
  qgrams.forEach(function(g) { if (grams.has(g)) hit++; });
  return hit / qgrams.size;
};
LightEngine.prototype._scores = function(strippedQuery) {
  var vec = this._index.vectorizeText(strippedQuery);
  var best = new Map();
  for (var i = 0; i < this._index.vectors.length; i++) {
    var sim = TfidfIndex.cosine(vec, this._index.vectors[i]);
    var itemIdx = this._docItem[i];
    if (!best.has(itemIdx) || sim > best.get(itemIdx)) {
      best.set(itemIdx, sim);
    }
  }
  var ranked = Array.from(best.entries());
  ranked.sort(function(a, b) { return b[1] - a[1]; });
  return ranked;
};
LightEngine.prototype.ask = function(question) {
  var raw = (question || "").trim();
  var hitCat = restrictionCheck(raw);
  if (hitCat) {
    return { status: "restricted", category: hitCat,
             message: REFUSALS[hitCat], item_id: null, sim: null };
  }
  var stripped = stripAffixes(raw);
  if (!stripped || _GREETINGS.has(stripped) ||
      _GREETINGS.has(normalizeText(raw))) {
    return { status: "greeting", message: GREETING_REPLY,
             item_id: null, sim: null };
  }
  var ranked = this._scores(stripped);
  if (!ranked.length) {
    return { status: "abstain", message: ABSTAIN_REPLY,
             item_id: null, sim: 0.0 };
  }
  var passing = [];
  for (var i = 0; i < ranked.length; i++) {
    if (ranked[i][1] < ANSWER_SIM) break;
    if (this._coverage(stripped, ranked[i][0]) >= COV_MIN) {
      passing.push(ranked[i]);
    }
  }
  if (!passing.length) {
    return { status: "abstain", message: ABSTAIN_REPLY,
             item_id: null, sim: round4(ranked[0][1]) };
  }
  var topIdx = passing[0][0], topSim = passing[0][1];
  var secondSim = passing.length > 1 ? passing[1][1] : 0.0;
  var item = this.items[topIdx];
  if (passing.length === 1 || topSim >= HIGH_CONF ||
      topSim - secondSim >= CLARIFY_BAND) {
    return { status: "answered", item_id: item.id, answer: item.a,
             src: item.src, cat: item.cat, sim: round4(topSim),
             message: item.a };
  }
  var cands = [];
  for (var k = 0; k < passing.length; k++) {
    if (passing[k][1] >= topSim - CLARIFY_BAND && cands.length < 3) {
      var it = this.items[passing[k][0]];
      cands.push({ item_id: it.id, label: choiceLabel(it),
                   sim: round4(passing[k][1]) });
    }
  }
  if (cands.length >= 2) {
    return { status: "clarify", candidates: cands, sim: round4(topSim),
             item_id: null,
             message: "いくつか候補があります。知りたかったのはどれですか？" };
  }
  return { status: "answered", item_id: item.id, answer: item.a,
           src: item.src, cat: item.cat, sim: round4(topSim),
           message: item.a };
};
LightEngine.prototype.itemById = function(itemId) {
  for (var i = 0; i < this.items.length; i++) {
    if (this.items[i].id === itemId) return this.items[i];
  }
  return null;
};

// Guide link buttons for the note / Instagram guidance items.
var GUIDE_LINKS = [
  { label: "noteを見る", url: "https://note.com/shisoatx" },
  { label: "Instagramを見る",
    url: "https://www.instagram.com/takasooo._.official/" }
];
var GUIDE_ITEM_IDS = { p148: 1, p149: 1, p150: 1, p151: 1, p153: 1 };
function guideLinks(itemId) {
  if (GUIDE_ITEM_IDS[itemId]) {
    return GUIDE_LINKS.map(function(x) {
      return { label: x.label, url: x.url };
    });
  }
  return null;
}

var AthenaLight = {
  normalize: normalizeText,
  stripAffixes: stripAffixes,
  restrictionCheck: restrictionCheck,
  REFUSALS: REFUSALS,
  piiScreenRecord: piiScreenRecord,
  LightEngine: LightEngine,
  guideLinks: guideLinks,
  GREETING_REPLY: GREETING_REPLY,
  ABSTAIN_REPLY: ABSTAIN_REPLY
};
if (typeof window !== "undefined") window.AthenaLight = AthenaLight;
if (typeof module !== "undefined" && module.exports) {
  module.exports = AthenaLight;
}
