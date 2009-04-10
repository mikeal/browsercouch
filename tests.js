var Tests = {
  run: function(container, console, setTimeout) {
    if (!container)
      container = this;
    if (!console) {
      if (!window.console)
        throw new Error("window.console unavailable");
      else
        console = window.console;
    }
    if (!setTimeout)
      setTimeout = window.setTimeout;

    var tests = [];

    for (name in container)
      if (name.indexOf("test") == "0") {
        var test = {
          name: name,
          func: container[name],
          isAsync: name.indexOf("_async") != -1,
          console: console,
          assertEqual: function assertEqual(a, b) {
            if (a != b)
              throw new Error(a + " != " + b);
          }
        };
        tests.push(test);
      }

    var nextTest = 0;

    function runNextTest() {
      if (nextTest < tests.length) {
        var test = tests[nextTest];
        console.log("Running " + test.name + "...");
        test.done = function() {
          console.log("OK");
          setTimeout(runNextTest, 0);
        };
        test.func(test);
        if (!test.isAsync)
          test.done();
        nextTest++;
      } else
        console.log("All tests passed.");
    }

    runNextTest();
  },
  testBasic_async: function(self) {
    BrowserCouch.get(
      "blarg",
      function(db) {
        db.put(
          [{id: "monkey",
            content: "hello there dude"},
           {id: "chunky",
            content: "hello there dogen"}],
          function() {
            db.view(
              {map: function(doc, emit) {
                 var words = doc.content.split(" ");
                 for (var i = 0; i < words.length; i++)
                   emit(words[i], 1);
               },
               reduce: function(keys, values) {
                 var totals = {};
                 for (var i = 0; i < keys.length; i++)
                   totals[keys[i]] = values[i].length;
                 return totals;
               },
               callback: function(result) {
                 self.assertEqual(result.hello, 2);
                 self.assertEqual(result.there, 2);
                 self.assertEqual(result.dude, 1);
                 self.assertEqual(result.dogen, 1);
                 self.done();
               }});
          });
      });
  }
};
