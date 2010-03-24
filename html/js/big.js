/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Ubiquity.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Atul Varma <atul@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

// == Big Couch Test ==
//
// This file tests the ability of BrowserCouch to process somewhat
// large data sets.  BrowserCouch isn't currently very good at this,
// however, so the data set isn't very big.
//
// The test can be run [[big.html|here]].

var MAX_WORD_LENGTH = 10;
var LEXICON_SIZE = 200;
var MIN_DOCUMENT_LENGTH = 250;
var MAX_DOCUMENT_LENGTH = 500;
var CORPUS_SIZE = 1000;
var UI_LOCK_LIMIT = 100;
var UI_BREATHE_TIME = 10;

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

function makeCorpus(db, progress, chunkSize, cb) {
  var lexicon = makeLexicon();
  var docs = [];
  var i = 0;

  function makeNextDocument() {
    var iAtStart = i;

    do {
      docs.push({id: i,
                 content: makeDocument(lexicon)});
      i += 1;
    } while (i - iAtStart < chunkSize &&
             i < CORPUS_SIZE);
    if (i == CORPUS_SIZE)
      db.put(docs, cb);
    else
      progress("make-documents", i / CORPUS_SIZE, makeNextDocument);
  }

  makeNextDocument();
}

var config = document.getElementById("config");
var statusArea = document.getElementById("status");
var result = document.getElementById("result");

statusArea.textContent = "Please wait...";
config.textContent = ("Counting word occurrences in a lexicon of " +
                      LEXICON_SIZE + " words, using a corpus of " +
                      CORPUS_SIZE + " documents, each of which is " +
                      MIN_DOCUMENT_LENGTH + " to " + MAX_DOCUMENT_LENGTH +
                      " words long.");

function makeProgress(func) {
  var lastDate = new Date();
  function progress(phase, percent, resume) {
    var currDate = new Date();
    if (currDate - lastDate > UI_LOCK_LIMIT) {
      lastDate = currDate;
      func.call(this, phase, percent);
      window.setTimeout(resume, UI_BREATHE_TIME);
    } else
      window.setTimeout(resume, 0);
  }

  return progress;
}

function start() {
  BrowserCouch.get(
    "big",
    function(db) {
      if (db.getLength() == 0) {
        db.wipe(function() {
                  makeCorpus(
                    db,
                    makeProgress(
                      function(phase, percent) {
                        statusArea.textContent = ("building new corpus (" +
                                                  Math.floor(percent * 100) +
                                                  "%)");
                      }),
                    25,
                    run
                  );
                });
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
           chunkSize: 25,
           progress: makeProgress(
             function(phase, percent) {
               percent = Math.floor(percent * 100);
               var msg = phase + " (" + percent + "%)";
               statusArea.textContent = msg;
             }),
           finished: function(aResult) {
             statusArea.textContent = "Done.";

             ModuleLoader.require(
               "JSON",
               function() {
                 result.textContent = JSON.stringify(aResult);
               });
           }}
        );
      }
    },
    new FakeStorage()
  );
}

window.addEventListener("load", start, false);
