var BrowserCouch = {
  get: function BC_get(name, cb) {
    cb(new this._DB(name, []));
  },

  _DB: function BC__DB(name, documents) {
    var docIdIndex = {};

    function putSingleDocument(doc) {
      if (doc.id in docIdIndex)
        documents[docIdIndex[doc.id]] = doc;
      else
        docIdIndex[doc.id] = documents.push(doc);
    }

    for (var i = 0; i < documents.length; i++)
      putSingleDocument(documents[i]);

    this.get = function DB_get(id, cb) {
      if (id in docIdIndex)
        cb(documents[docIdIndex[id]]);
      else
        cb(null);
    };

    this.put = function DB_put(document, cb) {
      if (document.constructor.name == "Array") {
        for (var i = 0; i < document.length; i++)
          putSingleDocument(document[i]);
      } else
        putSingleDocument(document);
      cb();
    };

    this.view = function DB_view(options) {
      var map = options.map;
      var reduce = options.reduce;

      if (!map)
        throw new Error('map function not provided');

      var mapResult = {};

      function emit(key, value) {
        // TODO: This assumes that the key will always be
        // an indexable value. We may have to hash the value,
        // though, if it's e.g. an Object.
        if (!mapResult[key])
          mapResult[key] = [];
        mapResult[key].push(value);
      }

      for (var i = 0; i < documents.length; i++)
        map(documents[i], emit);

      if (reduce) {
        var keys = [];
        var values = [];

        for (key in mapResult) {
          keys.push(key);
          values.push(mapResult[key]);
        }

        options.callback(reduce(keys, values));
      } else {
        var result = [];

        for (key in mapResult) {
          var values = mapResult[key];
          for (var i = 0; i < values.length; i++)
            result.push([key, values[i]]);
        }
        options.callback(result);
      }
    };
  }
};

var gCouch = BrowserCouch.get(
  "blarg",
  function(db) {
    console.log(db);
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
             console.log(result);
           }});
      });
  });
