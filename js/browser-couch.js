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

// = BrowserCouch =
//
// This is the primary implementation file for BrowserCouch.

// === {{{isArray()}}} ===
//
// A helper function to determine whether an object is an Array or
// not. Taken from
// [[http://javascript.crockford.com/remedial.html|Remedial JavaScript]]
// by Douglas Crockford.

function isArray(value) {
  return (typeof value.length === 'number' &&
          !(value.propertyIsEnumerable('length')) &&
          typeof value.splice === 'function');
}

// === {{{ModuleLoader}}} ===
//
// A really basic module loader that allows dependencies to be
// "lazy-loaded" when their functionality is needed.

var ModuleLoader = {
  LIBS: {JSON: "js/ext/json2.js",
         UUID: "js/ext/uuid.js"},

  require: function ML_require(libs, cb) {
    var self = this;
    var i = 0;
    var lastLib = "";

    if (!isArray(libs))
      libs = [libs];

    function loadNextLib() {
      if (lastLib && !window[lastLib])
        throw new Error("Failed to load library: " + lastLib);
      if (i == libs.length)
        cb();
      else {
        var libName = libs[i];
        i += 1;
        if (window[libName])
          loadNextLib();
        else {
          var libUrl = self.LIBS[libName];
          if (!libUrl)
            throw new Error("Unknown lib: " + libName);
          lastLib = libName;
          self._loadScript(libUrl, window, loadNextLib);
        }
      }
    }

    loadNextLib();
  },

  _loadScript: function ML__loadScript(url, window, cb) {
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
  }
};

// == MapReducer Implementations ==
//
// //MapReducer// is a generic interface for any map-reduce
// implementation. Any object implementing this interface will need
// to be able to work asynchronously, passing back control to the
// client at a given interval, so that the client has the ability to
// pause/cancel or report progress on the calculation if needed.

// === {{{WebWorkerMapReducer}}} ===
//
// A MapReducer that uses
// [[https://developer.mozilla.org/En/Using_DOM_workers|Web Workers]]
// for its implementation, allowing the client to take advantage of
// multiple processor cores and potentially decouple the map-reduce
// calculation from the user interface.
//
// The script run by spawned Web Workers is
// [[#js/worker-map-reducer.js|worker-map-reducer.js]].

function WebWorkerMapReducer(numWorkers, Worker) {
  if (!Worker)
    Worker = window.Worker;

  var pool = [];

  function MapWorker(id) {
    var worker = new Worker('js/worker-map-reducer.js');
    var onDone;

    worker.onmessage = function(event) {
      onDone(event.data);
    };

    this.id = id;
    this.map = function MW_map(map, dict, cb) {
      onDone = cb;
      worker.postMessage({map: map.toString(), dict: dict});
    };
  }

  for (var i = 0; i < numWorkers; i++)
    pool.push(new MapWorker(i));

  this.map = function WWMR_map(map, dict, progress, chunkSize, finished) {
    var keys = dict.getKeys();
    var size = keys.length;
    var workersDone = 0;
    var mapDict = {};

    function getNextChunk() {
      if (keys.length) {
        var chunkKeys = keys.slice(0, chunkSize);
        keys = keys.slice(chunkSize);
        var chunk = {};
        for (var i = 0; i < chunkKeys.length; i++)
          chunk[chunkKeys[i]] = dict.get(chunkKeys[i]);
        return chunk;
      } else
        return null;
    }

    function nextJob(mapWorker) {
      var chunk = getNextChunk();
      if (chunk) {
        mapWorker.map(
          map,
          chunk,
          function jobDone(aMapDict) {
            for (name in aMapDict)
              if (name in mapDict) {
                var item = mapDict[name];
                item.keys = item.keys.concat(aMapDict[name].keys);
                item.values = item.values.concat(aMapDict[name].values);
              } else
                mapDict[name] = aMapDict[name];

            if (keys.length)
              progress("map",
                       (size - keys.length) / size,
                       function() { nextJob(mapWorker); });
            else
              workerDone();
          });
      } else
        workerDone();
    }

    function workerDone() {
      workersDone += 1;
      if (workersDone == numWorkers)
        allWorkersDone();
    }

    function allWorkersDone() {
      var mapKeys = [];
      for (name in mapDict)
        mapKeys.push(name);
      mapKeys.sort();
      finished({dict: mapDict, keys: mapKeys});
    }

    for (var i = 0; i < numWorkers; i++)
      nextJob(pool[i]);
  };

  // TODO: Actually implement our own reduce() method here instead
  // of delegating to the single-threaded version.
  this.reduce = SingleThreadedMapReducer.reduce;
};

// === {{{SingleThreadedMapReducer}}} ===
//
// A MapReducer that works on the current thread.

var SingleThreadedMapReducer = {
  map: function STMR_map(map, dict, progress,
                         chunkSize, finished) {
    var mapDict = {};
    var keys = dict.getKeys();
    var currDoc;

    function emit(key, value) {
      // TODO: This assumes that the key will always be
      // an indexable value. We may have to hash the value,
      // though, if it's e.g. an Object.
      var item = mapDict[key];
      if (!item)
        item = mapDict[key] = {keys: [], values: []};
      item.keys.push(currDoc.id);
      item.values.push(value);
    }

    var i = 0;

    function continueMap() {
      var iAtStart = i;

      do {
        currDoc = dict.get(keys[i]);
        map(currDoc, emit);
        i++;
      } while (i - iAtStart < chunkSize &&
               i < keys.length)

      if (i == keys.length) {
        var mapKeys = [];
        for (name in mapDict)
          mapKeys.push(name);
        mapKeys.sort();
        finished({dict: mapDict, keys: mapKeys});
      } else
        progress("map", i / keys.length, continueMap);
    }

    continueMap();
  },

  reduce: function STMR_reduce(reduce, mapResult, progress,
                               chunkSize, finished) {
    var rows = [];
    var mapDict = mapResult.dict;
    var mapKeys = mapResult.keys;

    var i = 0;

    function continueReduce() {
      var iAtStart = i;

      do {
        var key = mapKeys[i];
        var item = mapDict[key];

        var keys = [];
        for (var j = 0; j < keys.length; j++)
          newKeys.push([key, item.keys[j]]);

        rows.push({key: key,
                   value: reduce(keys, item.values)});
        i++;
      } while (i - iAtStart < chunkSize &&
               i < mapKeys.length)

      if (i == mapKeys.length)
        finished(rows);
      else
        progress("reduce", i / mapKeys.length, continueReduce);
    }

    continueReduce();
  }
};

// == Storage Implementations ==
//
// //Storage// is a generic interface for a persistent storage
// implementation capable of storing JSON-able objects.

// === {{{FakeStorage}}} ===
//
// This Storage implementation isn't actually persistent; it's just
// a placeholder that can be used for testing purposes, or when no
// persistent storage mechanisms are available.

function FakeStorage() {
  var db = {};

  function deepCopy(obj) {
    if (typeof(obj) == "object") {
      var copy;

      if (isArray(obj))
        copy = new Array();
      else
        copy = new Object();

      for (name in obj) {
        if (obj.hasOwnProperty(name)) {
          var property = obj[name];
          if (typeof(property) == "object")
            copy[name] = deepCopy(property);
          else
            copy[name] = property;
        }
      }

      return copy;
    } else
      return obj;
  }

  this.get = function FS_get(name, cb) {
    if (!(name in db))
      cb(null);
    else
      cb(db[name]);
  };

  this.put = function FS_put(name, obj, cb) {
    db[name] = deepCopy(obj);
    cb();
  };
};

// === {{{LocalStorage}}} ===
//
// This Storage implementation uses the browser's HTML5 support for
// {{{localStorage}}} or {{{globalStorage}}} for object persistence.

function LocalStorage(JSON) {
  var storage;

  if (window.globalStorage)
    storage = window.globalStorage[location.hostname];
  else {
    if (window.localStorage)
      storage = window.localStorage;
    else
      throw new Error("globalStorage/localStorage not available.");
  }

  function ensureJSON(cb) {
    if (!JSON) {
      ModuleLoader.require(
        "JSON",
        function() {
          JSON = window.JSON;
          cb();
        });
    } else
      cb();
  }

  this.get = function LS_get(name, cb) {
    if (name in storage && storage[name].value)
      ensureJSON(
        function() {
          var obj = JSON.parse(storage[name].value);
          cb(obj);
        });
    else
      cb(null);
  };

  this.put = function LS_put(name, obj, cb) {
    ensureJSON(
      function() {
        storage[name] = JSON.stringify(obj);
        cb();
      });
  };
}

LocalStorage.isAvailable = (this.location &&
                            this.location.protocol != "file:" &&
                            (this.globalStorage || this.localStorage));

// == BrowserCouch ==
//
// {{{BrowserCouch}}} is the main object that clients will use.  It's
// intended to be somewhat analogous to CouchDB's RESTful API.

var BrowserCouch = {
  get: function BC_get(name, cb, storage) {
    if (!storage)
      storage = new LocalStorage();

    new this._DB(name, storage, new this._Dictionary(), cb);
  },

  _Dictionary: function BC__Dictionary() {
    var dict = {};
    var keys = [];

    function regenerateKeys() {
      keys = [];
      for (key in dict)
        keys.push(key);
    }

    this.has = function Dictionary_has(key) {
      return (key in dict);
    };

    this.getKeys = function Dictionary_getKeys() {
      return keys;
    };

    this.get = function Dictionary_get(key) {
      return dict[key];
    };

    this.set = function Dictionary_set(key, value) {
      if (!(key in dict))
        keys.push(key);
      dict[key] = value;
    };

    this.remove = function Dictionary_delete(key) {
      delete dict[key];

      // TODO: If we're in JS 1.6 and have Array.indexOf(), we
      // shouldn't have to rebuild the key index like this.
      regenerateKeys();
    };

    this.clear = function Dictionary_clear() {
      dict = {};
      keys = [];
    };

    this.pickle = function Dictionary_pickle() {
      return dict;
    };

    this.unpickle = function Dictionary_unpickle(obj) {
      dict = obj;
      regenerateKeys();
    };
  },

  _DB: function BC__DB(name, storage, dict, cb) {
    var self = this;
    var dbName = 'BrowserCouch_DB_' + name;

    function commitToStorage(cb) {
      if (!cb)
        cb = function() {};
      storage.put(dbName, dict.pickle(), cb);
    }

    this.wipe = function DB_wipe(cb) {
      dict.clear();
      commitToStorage(cb);
    };

    this.get = function DB_get(id, cb) {
      if (dict.has(id))
        cb(dict.get(id));
      else
        cb(null);
    };

    this.put = function DB_put(document, cb) {
      if (isArray(document)) {
        for (var i = 0; i < document.length; i++)
          dict.set(document[i].id, document[i]);
      } else
        dict.set(document.id, document);

      commitToStorage(cb);
    };

    this.getLength = function DB_getLength() {
      return dict.getKeys().length;
    };

    this.view = function DB_view(options) {
      if (!options.map)
        throw new Error('map function not provided');
      if (!options.finished)
        throw new Error('finished callback not provided');

      // Maximum number of items to process before giving the UI a chance
      // to breathe.
      var DEFAULT_CHUNK_SIZE = 1000;

      // If no progress callback is given, we'll automatically give the
      // UI a chance to breathe for this many milliseconds before continuing
      // processing.
      var DEFAULT_UI_BREATHE_TIME = 50;

      var chunkSize = options.chunkSize;
      if (!chunkSize)
        chunkSize = DEFAULT_CHUNK_SIZE;

      var progress = options.progress;
      if (!progress)
        progress = function defaultProgress(phase, percent, resume) {
          window.setTimeout(resume, DEFAULT_UI_BREATHE_TIME);
        };

      var mapReducer = options.mapReducer;
      if (!mapReducer)
        mapReducer = SingleThreadedMapReducer;

      mapReducer.map(
        options.map,
        dict,
        progress,
        chunkSize,
        function(mapResult) {
          if (options.reduce)
            mapReducer.reduce(
              options.reduce,
              mapResult,
              progress,
              chunkSize,
              function(rows) {
                options.finished(new BrowserCouch._View(rows));
              });
          else
            options.finished(new BrowserCouch._MapView(mapResult));
        });
    };

    storage.get(
      dbName,
      function(obj) {
        if (obj)
          dict.unpickle(obj);
        cb(self);
      });
  },

  _View: function BC__View(rows) {
    this.rows = rows;

    function findRow(key, rows) {
      if (rows.length > 1) {
        var midpoint = Math.floor(rows.length / 2);
        var row = rows[midpoint];
        if (key < row.key)
          return findRow(key, rows.slice(0, midpoint));
        if (key > row.key)
          return midpoint + findRow(key, rows.slice(midpoint));
        return midpoint;
      } else
        return 0;
    }

    this.findRow = function V_findRow(key) {
      return findRow(key, rows);
    };
  },

  _MapView: function BC__MapView(mapResult) {
    var rows = [];
    var keyRows = [];

    var mapKeys = mapResult.keys;
    var mapDict = mapResult.dict;

    for (var i = 0; i < mapKeys.length; i++) {
      var key = mapKeys[i];
      var item = mapDict[key];
      keyRows.push({key: key, pos: rows.length});
      var newRows = [];
      for (var j = 0; j < item.keys.length; j++) {
        var id = item.keys[j];
        var value = item.values[j];
        newRows.push({id: id,
                      key: key,
                      value: value});
      }
      newRows.sort(function(a, b) {
                     if (a.id < b.id)
                       return -1;
                     if (a.id > b.id)
                       return 1;
                     return 0;
                   });
      rows = rows.concat(newRows);
    }

    function findRow(key, keyRows) {
      if (keyRows.length > 1) {
        var midpoint = Math.floor(keyRows.length / 2);
        var keyRow = keyRows[midpoint];
        if (key < keyRow.key)
          return findRow(key, keyRows.slice(0, midpoint));
        if (key > keyRow.key)
          return findRow(key, keyRows.slice(midpoint));
        return keyRow.pos;
      } else
        return keyRows[0].pos;
    }

    this.rows = rows;
    this.findRow = function MV_findRow(key) {
      return findRow(key, keyRows);
    };
  }
};
