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

function isArray(value) {
  // Taken from "Remedial Javascript" by Douglas Crockford:
  // http://javascript.crockford.com/remedial.html

  return (typeof value.length === 'number' &&
          !(value.propertyIsEnumerable('length')) &&
          typeof value.splice === 'function');
}

var ModuleLoader = {
  LIBS: {JSON: "json2.js"},

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

function WebWorkerMapReducer(numWorkers, Worker) {
  if (!Worker)
    Worker = window.Worker;

  var pool = [];

  function MapWorker() {
    var worker = new Worker('worker-map-reducer.js');
    var onDone;

    worker.onmessage = function(event) {
      onDone(event.data);
    };

    this.map = function MW_map(map, dict, cb) {
      onDone = cb;
      worker.postMessage({map: map.toString(), dict: dict});
    };
  }

  for (var i = 0; i < numWorkers; i++)
    pool.push(new MapWorker());

  this.map = function WWMR_map(map, dict, progress, chunkSize, finished) {
    pool[0].map(map,
                dict.pickle(),
                function onDone(mapDict) {
                  var mapKeys = [];
                  for (name in mapDict)
                    mapKeys.push(name);
                  mapKeys.sort();
                  finished({dict: mapDict, keys: mapKeys});
                });

    // TODO:

    // Break up the dict into multiple chunks.

    // Issue each worker a chunk.

    // When a worker is done with a chunk, pass it a new one and call
    // the progress callback.

    // When there are no more chunks left to pass out, we're done;
    // merge all the results into a single mapResult and pass it
    // to the finished() callback.
  };

  this.reduce = SingleThreadedMapReducer.reduce;
};

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

        // TODO: The map() method is only available on JS 1.6.
        var keys = item.keys.map(function pairKeyWithDocId(docId) {
                                   return [key, docId];
                                 });
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
    this.rows = rows;

    var mapKeys = mapResult.keys;
    var mapDict = mapResult.dict;

    for (var i = 0; i < mapKeys.length; i++) {
      var key = mapKeys[i];
      var item = mapDict[key];
      keyRows.push({key: key, pos: rows.length});
      for (var j = 0; j < item.keys.length; j++) {
        var id = item.keys[j];
        var value = item.values[j];
        rows.push({id: id,
                   key: key,
                   value: value});
      }
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

    this.findRow = function MV_findRow(key) {
      return findRow(key, keyRows);
    };
  }
};
