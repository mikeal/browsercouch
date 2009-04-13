var MAX_WORD_LENGTH = 10;
var LEXICON_SIZE = 200;
var MIN_DOCUMENT_LENGTH = 250;
var MAX_DOCUMENT_LENGTH = 500;
var CORPUS_SIZE = 100;

// Returns a random integer between min and max
// Using Math.round() will give you a non-uniform distribution!
function getRandomInt(min, max)
{
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeRandomWord() {
  var word = "";
  var len = getRandomInt(1, MAX_WORD_LENGTH);
  for (var i = 0; i < len; i++) {
    var charCode = getRandomInt("a".charCodeAt(0),
                                "z".charCodeAt(0));
    var letter = String.fromCharCode(charCode);
    word += letter;
  }
  return word;
}

function makeLexicon() {
  var lexicon = [];

  for (var i = 0; i < LEXICON_SIZE; i++)
    lexicon.push(makeRandomWord());

  return lexicon;
}

function makeDocument(lexicon) {
  var len = getRandomInt(MIN_DOCUMENT_LENGTH,
                         MAX_DOCUMENT_LENGTH);
  var doc = [];

  for (var i = 0; i < len; i++) {
    var wordIndex = getRandomInt(0, lexicon.length);
    doc.push(lexicon[wordIndex]);
  }

  return doc.join(" ");
}

function makeCorpus(db, cb) {
  var lexicon = makeLexicon();
  var docs = [];

  for (var i = 0; i < CORPUS_SIZE; i++)
    docs.push({id: i,
               content: makeDocument(lexicon)});

  db.put(docs, cb);
}

var config = document.getElementById("config");
var status = document.getElementById("status");
var result = document.getElementById("result");

status.textContent = "Please wait...";
config.textContent = ("Counting word occurrences in a lexicon of " +
                      LEXICON_SIZE + " words, using a corpus of " +
                      CORPUS_SIZE + " documents, each of which is " +
                      MIN_DOCUMENT_LENGTH + " to " + MAX_DOCUMENT_LENGTH +
                      " words long.");

function start() {
  BrowserCouch.get(
    "big",
    function(db) {
      if (db.getLength() == 0) {
        status.textContent = "Building new corpus.";
        db.wipe(function() { makeCorpus(db, run); });
      } else
        run();

      function run() {
        db.view(
          {map: function(doc, emit) {
             var words = doc.content.split(" ");
             for (var i = 0; i < words.length; i++)
               emit(words[i], 1);
           },
           reduce: function(keys, values) {
             var sum = 0;
             for (var i = 0; i < values.length; i++)
               sum += values[i];
             return sum;
           },
           chunkSize: 5,
           progress: function(phase, percent, resume) {
             percent = Math.floor(percent * 100);
             var msg = phase + " (" + percent + "%)";
             status.textContent = msg;
             window.setTimeout(resume, 5);
           },
           finished: function(aResult) {
             status.textContent = "Done.";
             result.textContent = JSON.stringify(aResult);
           }}
        );
      }
    });
}

window.addEventListener("load", start, false);
