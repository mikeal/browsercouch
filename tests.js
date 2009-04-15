var Tests = {
  run: function(listener, container, setTimeout) {
    if (!container)
      container = this;
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
  },
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
    BrowserCouch.get(
      "blarg",
      function(db) {
        db.wipe(
          function() {
            db.put(
              [{id: "monkey",
                content: "hello there dude"},
               {id: "chunky",
                content: "hello there dogen"}],
              function() {
                ModuleLoader.require(
                  "JSON",
                  function() { cb(db); }
                );
              }
            );
          });
      },
      new FakeStorage()
    );
  },
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
               rows:[{"id":"chunky","key":"dogen","value":1},
                     {"id":"monkey","key":"dude","value":1},
                     {"id":"monkey","key":"hello","value":1},
                     {"id":"chunky","key":"hello","value":1},
                     {"id":"monkey","key":"there","value":1},
                     {"id":"chunky","key":"there","value":1}]
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
             mapReducer: new WebWorkerMapReducer(2),
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
  }
};
