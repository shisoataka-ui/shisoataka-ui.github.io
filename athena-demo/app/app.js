// Athena public demo - smartphone light edition UI.
//
// Everything runs on this device: the light matcher answers from
// the bundled dummy KB, and the usage records are stored only in
// this browser's local storage. Nothing is transmitted anywhere;
// records leave the device only when the visitor explicitly
// exports them to a file and sends that file back (the exported
// JSONL uses the same record schema as the PC edition's export,
// so returned files can be aggregated and used for learning in
// exactly the same way).
"use strict";

var engine = new AthenaLight.LightEngine(window.ATHENA_KB);
var logId = null;
var receipt = null;
var offeredCandidates = null; // item ids offered for the current logId

var RECORDS_KEY = "athenaDemoMobileRecords";
var RECEIPT_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function $(id) { return document.getElementById(id); }
function show(id, on) { $(id).style.display = on ? "block" : "none"; }

function nowIsoJst() {
  var d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  function p(n) { return (n < 10 ? "0" : "") + n; }
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" +
    p(d.getUTCDate()) + "T" + p(d.getUTCHours()) + ":" +
    p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) + "+09:00";
}
function todayJst() { return nowIsoJst().slice(0, 10); }

function randomHex(nBytes) {
  var buf = new Uint8Array(nBytes);
  crypto.getRandomValues(buf);
  var out = "";
  buf.forEach(function(b) { out += ("0" + b.toString(16)).slice(-2); });
  return out;
}
function newReceipt(existing) {
  for (;;) {
    var buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    var code = "";
    buf.forEach(function(b) {
      code += RECEIPT_ALPHABET[b % RECEIPT_ALPHABET.length];
    });
    if (!existing[code]) return code;
  }
}

function loadRecords() {
  try {
    var raw = localStorage.getItem(RECORDS_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveRecords(records) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); }
  catch (e) { /* storage full/blocked: the demo itself keeps working */ }
}
function appendRecord(record) {
  var records = loadRecords();
  records.push(record);
  saveRecords(records);
}
function queueByReceipt() {
  var map = {};
  loadRecords().forEach(function(r) {
    if (r.type !== "queue_event") return;
    if (r.kind === "created") {
      map[r.receipt] = { receipt: r.receipt, log_id: r.log_id,
                         question: r.question, intended: "",
                         status: "pending", created_at: r.ts };
    } else if (r.kind === "intent" && map[r.receipt]) {
      map[r.receipt].intended = r.intended || "";
    }
  });
  return map;
}

function consented() {
  try { return localStorage.getItem("athenaDemoConsent") === "1"; }
  catch (e) { return false; }
}
function loggedIn() {
  try { return sessionStorage.getItem("athenaDemoLogin") === "1"; }
  catch (e) { return false; }
}
function gateOverlay() {
  if (!consented()) { $("consentOverlay").style.display = "block"; }
  else if (!loggedIn()) { $("loginOverlay").style.display = "block"; }
}

function resetPanels() {
  show("feedback", false); show("intentBox", false); show("thanks", false);
  show("receiptBox", false);
  $("expectedBox").style.display = "none";
  $("expected").value = ""; $("intended").value = "";
  $("choices").innerHTML = "";
  $("links").innerHTML = "";
}
function showLinks(links) {
  $("links").innerHTML = "";
  (links || []).forEach(function(l) {
    var a = document.createElement("a");
    a.className = "linkbtn"; a.href = l.url;
    a.target = "_blank"; a.rel = "noopener";
    a.textContent = l.label;
    $("links").appendChild(a);
  });
}
function showFeedback() { show("feedback", true); }

function recordAsk(question, result) {
  var record = { type: "ask", ts: nowIsoJst(), log_id: logId,
                 mobile: true, question: question,
                 status: result.status,
                 item_id: result.item_id || null,
                 sim: (result.sim === undefined ? null : result.sim) };
  if (result.status === "restricted") record.category = result.category;
  if (result.status === "clarify") {
    record.candidates = result.candidates.map(function(c) {
      return c.item_id;
    });
  }
  var hits = AthenaLight.piiScreenRecord({ question: question });
  if (Object.keys(hits).length) record.pii = hits;
  appendRecord(record);
}

function ask() {
  var q = $("q").value.trim();
  if (!q) return;
  if (!consented()) { $("consentOverlay").style.display = "block"; return; }
  if (!loggedIn()) { $("loginOverlay").style.display = "block"; return; }
  resetPanels();
  logId = randomHex(8); receipt = null; offeredCandidates = null;
  var result = engine.ask(q);
  recordAsk(q, result);
  show("answer", true);
  $("src").textContent = "";
  if (result.status === "answered") {
    $("answerText").textContent = result.answer;
    $("src").textContent = "出典：" + result.src + "（" + result.cat + "）";
    showLinks(AthenaLight.guideLinks(result.item_id));
    showFeedback();
  } else if (result.status === "clarify") {
    offeredCandidates = result.candidates.map(function(c) {
      return c.item_id;
    });
    $("answerText").textContent = result.message;
    result.candidates.forEach(function(c) {
      var b = document.createElement("button");
      b.className = "pick"; b.textContent = "・ " + c.label;
      b.onclick = function() { pick(c.item_id); };
      $("choices").appendChild(b);
    });
  } else if (result.status === "abstain") {
    $("answerText").textContent = result.message;
    receipt = newReceipt(queueByReceipt());
    appendRecord({ type: "queue_event", kind: "created",
                   receipt: receipt, log_id: logId, question: q,
                   ts: nowIsoJst() });
    $("receiptCode").textContent = receipt;
    show("receiptBox", true);
    show("intentBox", true);
  } else {
    // greeting / restricted: fixed texts, nothing else to collect.
    $("answerText").textContent = result.message;
  }
}

function pick(chosenItemId) {
  // Only an item actually offered for this question may be picked
  // (same extraction guard as the PC edition's server).
  if (!offeredCandidates || offeredCandidates.indexOf(chosenItemId) < 0) {
    return;
  }
  var item = engine.itemById(chosenItemId);
  if (!item) return;
  appendRecord({ type: "clarify_select", ts: nowIsoJst(), log_id: logId,
                 mobile: true, chosen_item_id: chosenItemId,
                 candidates: offeredCandidates.slice() });
  offeredCandidates = null;
  $("choices").innerHTML = "";
  $("answerText").textContent = item.a;
  $("src").textContent = "出典：" + item.src + "（" + item.cat + "）";
  showLinks(AthenaLight.guideLinks(item.id));
  showFeedback();
}

function sendFeedback(verdict, expected, intended) {
  var record = { type: "feedback", ts: nowIsoJst(), log_id: logId,
                 mobile: true, verdict: verdict,
                 expected: expected || "", intended: intended || "" };
  var hits = AthenaLight.piiScreenRecord(
    { expected: record.expected, intended: record.intended });
  if (Object.keys(hits).length) record.pii = hits;
  appendRecord(record);
  if (verdict === "intent" && receipt) {
    appendRecord({ type: "queue_event", kind: "intent",
                   receipt: receipt, intended: record.intended,
                   ts: nowIsoJst() });
  }
}

function checkRecord() {
  var code = $("receiptInput").value.trim().toUpperCase();
  if (!code) return;
  var box = $("checkResult");
  box.style.display = "block";
  var entry = queueByReceipt()[code];
  if (!entry) {
    box.textContent = "その受付番号は見つかりませんでした。番号を確認してください。" +
      "（確認できるのは、この端末で記録した質問だけです）";
    return;
  }
  box.textContent = "質問：" + entry.question +
    "\nこの質問は記録されています。記録の送り返し方は、このページ下部の" +
    "「学習データの書き出し」をご覧ください。";
  box.style.whiteSpace = "pre-wrap";
}

function exportLog() {
  var box = $("exportResult");
  box.style.display = "block";
  var records = loadRecords();
  var usage = records.filter(function(r) { return r.type !== "queue_event"; });
  var queue = records.filter(function(r) { return r.type === "queue_event"; });
  if (!records.length) {
    box.textContent = "まだ記録がありません。質問すると、ここから書き出せるようになります。";
    return;
  }
  var lines = usage.concat(queue).map(function(r) {
    return JSON.stringify(r);
  });
  var blob = new Blob([lines.join("\n") + "\n"],
                      { type: "application/x-ndjson" });
  var name = "athena-demo-usage-" + todayJst() + ".jsonl";
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 5000);
  box.textContent = "記録ファイルを書き出しました（" + name + "）。" +
    "このファイルを、案内された方法で送ってください。ありがとうございます。";
}

var CHIP_QUESTIONS = [
  "このコマの組み立て方を教えて",
  "子どもが使っても安全ですか",
  "このコマはいくらですか",
  "Athenaの特長を教えて",
  "このコマを作ったのは誰ですか",
  "逆さゴマはありますか"
];
var CHIP_LINKS = [
  { label: "noteを見る", url: "https://note.com/shisoatx" },
  { label: "Instagramを見る",
    url: "https://www.instagram.com/takasooo._.official/" }
];
function renderChips(el, caption) {
  var cap = document.createElement("div");
  cap.className = "cap"; cap.textContent = caption;
  el.appendChild(cap);
  CHIP_QUESTIONS.forEach(function(q) {
    var b = document.createElement("button");
    b.className = "chip"; b.textContent = q;
    b.onclick = function() {
      $("q").value = q;
      ask();
      window.scrollTo(0, 0);
    };
    el.appendChild(b);
  });
  CHIP_LINKS.forEach(function(l) {
    var a = document.createElement("a");
    a.className = "chip"; a.href = l.url;
    a.target = "_blank"; a.rel = "noopener";
    a.textContent = l.label;
    el.appendChild(a);
  });
}
renderChips($("topChips"), "タップするだけでも聞けます");
renderChips($("nextChips"), "次に聞けること");

$("exportBtn").onclick = exportLog;
$("askBtn").onclick = ask;
$("q").addEventListener("keydown", function(e) {
  if (e.key === "Enter") ask();
});
$("checkBtn").onclick = checkRecord;
$("okBtn").onclick = function() {
  sendFeedback("correct", "", "");
  show("feedback", false); show("thanks", true);
};
$("ngBtn").onclick = function() { $("expectedBox").style.display = "block"; };
$("expectedSend").onclick = function() {
  sendFeedback("wrong", $("expected").value, "");
  show("feedback", false); show("thanks", true);
};
$("intentSend").onclick = function() {
  sendFeedback("intent", "", $("intended").value);
  show("intentBox", false); show("thanks", true);
};
$("agreeBtn").onclick = function() {
  try { localStorage.setItem("athenaDemoConsent", "1"); } catch (e) {}
  $("consentOverlay").style.display = "none";
  gateOverlay();
};
$("loginBtn").onclick = function() {
  // Demo-only login: nothing is sent anywhere; the prefilled demo
  // account simply opens the demo.
  try { sessionStorage.setItem("athenaDemoLogin", "1"); } catch (e) {}
  $("loginOverlay").style.display = "none";
};
gateOverlay();
