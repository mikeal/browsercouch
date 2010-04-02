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

// = BrowserCouch Test Suite =
//
// This file contains a simple test runner and suite for BrowserCouch.
//
// The suite can be run [[tests.html|here]].

// == The Runner ==
//
// The {{{Testing}}} namespace is a simple test framework that supports
// the skipping of tests (for when the host system doesn't support
// required functionality for a test's execution), as well as
// asynchronous tests.
//
// It doesn't currently have the ability to detect when an asynchronous
// test has failed, however.

var Testing = {
  run: function(listener, container, setTimeout) {
    if (!setTimeout)
      setTimeout = window.setTimeout;

    var tests = [];

    for (name in container)
      if (name.indexOf("test") == "0") {
        var test = {
          name: name,
          func: container[name],
          isAsync: name.indexOf("_async") != -1,
          id: tests.length,
          assertEqual: function assertEqual(a, b) {
            if (a != b)
              throw new Error(a + " != " + b);
          }
        };
        tests.push(test);
      }

    listener.onReady(tests);
    var nextTest = 0;

    function runNextTest() {
      if (nextTest < tests.length) {
        var test = tests[nextTest];
        listener.onRun(test);
        test.skip = function() {
          listener.onSkip(this);
          setTimeout(runNextTest, 0);
        };
        test.done = function() {
          listener.onFinish(this);
          setTimeout(runNextTest, 0);
        };
        test.func.call(container, test);
        if (!test.isAsync)
          test.done();
        nextTest++;
      }
    }

    runNextTest();
  }
};

// == The Suite ==
//
// The {{{Tests}}} namespace contains the actual testing suite for
// BrowserCouch.

var Tests = {
  testDictionary: function(self) {
    var dict = new BrowserCouch._Dictionary();
    dict.set('foo', {a: 'hello'});
    dict.set('bar', {b: 'goodbye'});
    self.assertEqual(dict.get('foo').a, 'hello');
    self.assertEqual(dict.get('bar').b, 'goodbye');
    self.assertEqual(dict.getKeys().length, 2);
    self.assertEqual(dict.has('foo'), true);
    self.assertEqual(dict.has('bar'), true);
    self.assertEqual(dict.has('spatula'), false);
    dict.remove('bar');
    self.assertEqual(dict.getKeys().length, 1);
    self.assertEqual(dict.has('foo'), true);
  },
  _setupTestDb: function(cb) {
    var documents = this._testDbContents;
    var db = BrowserCouch("blarg", {storage: new BrowserCouch.FakeStorage()});
    db.onload(function() {
      db.wipe(
        function() {
            db.put(
              documents,
              function() {
                BrowserCouch.ModuleLoader.require(
                  "JSON",
                  function() { cb(db); }
                );
              }
            );
          });
      });
  },
  _testDbContents: [{_id: "monkey",
                     content: "hello there dude"},
                    {_id: "chunky",
                     content: "hello there dogen"}],
  _mapWordFrequencies: function(doc, emit) {
    var words = doc.content.split(" ");
    for (var i = 0; i < words.length; i++)
      emit(words[i], 1);
  },
  _reduceWordFrequencies: function(keys, values) {
    var sum = 0;
    for (var i = 0; i < values.length; i++)
      sum += values[i];
    return sum;
  },
  testViewMap_async: function(self) {
    var map = this._mapWordFrequencies;
    this._setupTestDb(
      function(db) {
        db.view(
          {map: map,
           finished: function(result) {
             var expected = {
               rows:[{"_id":"chunky","key":"dogen","value":1},
                     {"_id":"monkey","key":"dude","value":1},
                     {"_id":"chunky","key":"hello","value":1},
                     {"_id":"monkey","key":"hello","value":1},
                     {"_id":"chunky","key":"there","value":1},
                     {"_id":"monkey","key":"there","value":1}]
             };
             self.assertEqual(JSON.stringify(expected),
                              JSON.stringify(result));
             self.done();
           }});
      });
  },
  testViewMapFindRow_async: function(self) {
    var map = this._mapWordFrequencies;
    this._setupTestDb(
      function(db) {
        db.view(
          {map: map,
           finished: function(view) {
             self.assertEqual(view.findRow("dogen"), 0);
             self.assertEqual(view.findRow("dude"), 1);
             self.assertEqual(view.findRow("hello"), 2);
             self.assertEqual(view.findRow("there"), 4);
             self.done();
           }});
      });
  },
  testViewProgress_async: function(self) {
    var map = this._mapWordFrequencies;
    var reduce = this._reduceWordFrequencies;
    this._setupTestDb(
      function(db) {
        var progressCalled = false;
        var timesProgressCalled = 0;
        db.view(
          {map: map,
           reduce: reduce,
           chunkSize: 1,
           progress: function(phase, percentDone, resume) {
             if (phase == "map") {
               self.assertEqual(percentDone, 0.5);
               progressCalled = true;
             }
             resume();
           },
           finished: function(result) {
             self.assertEqual(progressCalled, true);
             self.done();
           }});
      });
  },
  testViewMapReduceFindRow_async: function(self) {
    var map = this._mapWordFrequencies;
    var reduce = this._reduceWordFrequencies;
    this._setupTestDb(
      function(db) {
        db.view(
          {map: map,
           reduce: reduce,
           finished: function(view) {
             self.assertEqual(view.findRow("dogen"), 0);
             self.assertEqual(view.findRow("dude"), 1);
             self.assertEqual(view.findRow("hello"), 2);
             self.assertEqual(view.findRow("there"), 3);
             self.done();
           }});
      });
  },
  testViewMapReduceWebWorker_async: function(self) {
    if (window.Worker) {
      var map = this._mapWordFrequencies;
      var reduce = this._reduceWordFrequencies;
      this._setupTestDb(
        function(db) {
          db.view(
            {map: map,
             reduce: reduce,
             mapReducer: new BrowserCouch.WebWorkerMapReducer(2),
             chunkSize: 1,
             finished: function(result) {
               var expected = {rows: [{key: "dogen", value: 1},
                                      {key: "dude", value: 1},
                                      {key: "hello", value: 2},
                                      {key: "there", value: 2}]};
               self.assertEqual(JSON.stringify(expected),
                                JSON.stringify(result));
               self.done();
             }});
        });
    } else
      self.skip();
  },
  testViewMapReduce_async: function(self) {
    var map = this._mapWordFrequencies;
    var reduce = this._reduceWordFrequencies;
    this._setupTestDb(
      function(db) {
        db.view(
          {map: map,
           reduce: reduce,
           finished: function(result) {
             var expected = {rows: [{key: "dogen", value: 1},
                                    {key: "dude", value: 1},
                                    {key: "hello", value: 2},
                                    {key: "there", value: 2}]};
             self.assertEqual(JSON.stringify(expected),
                              JSON.stringify(result));
             self.done();
           }});
      });
  },
  testLocalStorage_async: function(self) {
    if (BrowserCouch.LocalStorage.isAvailable) {
      BrowserCouch.ModuleLoader.require(
        "JSON",
        function() {
          var storage = new BrowserCouch.LocalStorage(JSON);
          var name = "BrowserCouch_test_DB";

          var data = {test: "hi",
                      foo: [1,2,3]};

          storage.put(
            name,
            data,
            function() {
              storage.get(
                name,
                function(returnedData) {
                  if (data == returnedData)
                    throw new Error("Returned data should not be " +
                                    "the same object as passed-in " +
                                    "data.");
                  self.assertEqual(JSON.stringify(data),
                                   JSON.stringify(returnedData));
                  self.done();
                });
            });
        });
    } else
      self.skip();
  }
};
