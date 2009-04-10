
var BrowserCouch = {
  get: function BC_get(name, cb, storage, JSON) {
    var self = this;

    function createDb() {
      cb(new self._DB(name, storage, JSON));
    }

    if (!storage) {
      if (window.globalStorage || window.localStorage) {
        if (window.globalStorage)
          storage = window.globalStorage[location.hostname];
        else
          storage = window.localStorage;
        if (window.JSON) {
          JSON = window.JSON;
          createDb();
        } else
          self._loadScript(
            "json2.js",
            window,
            function() {
              if (!window.JSON)
                throw new Error('JSON library failed to load');
              JSON = window.JSON;
              createDb();
            });
      } else {
        /* TODO: Consider using JSPersist or something else here. */
        throw new Error('unable to find persistent storage backend');
      }
    } else
      createDb();
  },

  _loadScript: function BC__loadScript(url, window, cb) {
    var doc = window.document;
    var script = doc.createElement("script");
    script.setAttribute("src", url);
    script.addEventListener(
      "load",
      function onLoad() {
        script.removeEventListener("load", onLoad, false);
        cb();
      },
      false
    );
    doc.body.appendChild(script);
  },

  _DB: function BC__DB(name, storage, JSON) {
    var dbName = 'BrowserCouch_DB_' + name;

    var documents = [];
    var docIdIndex = {};

    if (dbName in storage && storage[dbName].value) {
      console.log(storage[dbName].value);
      var db = JSON.parse(storage[dbName].value);
      documents = db.documents;
      docIdIndex = db.docIdIndex;
    }

    function commitToStorage() {
      storage[dbName].value = JSON.stringify(
        {documents: documents,
         docIdIndex: docIdIndex}
      );
    }

    this.wipe = function DB_wipe(cb) {
      documents = [];
      docIdIndex = {};
      commitToStorage();
      if (cb)
        cb();
    };

    this.get = function DB_get(id, cb) {
      if (id in docIdIndex)
        cb(documents[docIdIndex[id]]);
      else
        cb(null);
    };

    this.put = function DB_put(document, cb) {
      function putSingleDocument(doc) {
        if (doc.id in docIdIndex)
          documents[docIdIndex[doc.id]] = doc;
        else
          docIdIndex[doc.id] = documents.push(doc) - 1;
      }

      if (document.constructor.name == "Array") {
        for (var i = 0; i < document.length; i++)
          putSingleDocument(document[i]);
      } else
        putSingleDocument(document);
      commitToStorage();
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

var gDb;

BrowserCouch.get(
  "blarg",
  function(db) {
    gDb = db;
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
