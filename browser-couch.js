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

var ModuleLoader = {
  LIBS: {JSON: "json2.js"},

  require: function ML_require(libs, cb) {
    var self = this;
    var i = 0;
    var lastLib = "";

    if (libs.constructor.name != "Array")
      libs = [libs];

    function loadNextLib() {
      if (lastLib && !window[lastLib])
        throw new Error("Failed to load library: " + lastLib);
      if (i == libs.length)
        cb();
      else {
        var libName = libs[i];
        i += 1;
        if (window.libName)
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

function FakeStorage() {
  var db = {};

  function deepCopy(obj) {
    if (typeof(obj) == "object") {
      var copy;

      if (obj.constructor.name == "Array")
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

    this.delete = function Dictionary_delete(key) {
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
      if (document.constructor.name == "Array") {
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
      // TODO: Add support for worker threads.

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

      BrowserCouch._map(
        options.map,
        dict,
        progress,
        chunkSize,
        function(mapDict) {
          BrowserCouch._reduce(options.reduce,
                               mapDict,
                               progress,
                               chunkSize,
                               options.finished);
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

  _map: function BC__map(map, dict, progress,
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

      if (i == keys.length)
        finished(mapDict);
      else
        progress("map", i / keys.length, continueMap);
    }

    continueMap();
  },

  _reduce: function BC__reduce(reduce, mapDict, progress,
                               chunkSize, finished) {
    var rows = [];
    var mapKeys = [];
    for (name in mapDict)
      mapKeys.push(name);

    mapKeys.sort();

    if (reduce) {
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
          doneWithReduce();
        else
          progress("reduce", i / mapKeys.length, continueReduce);
      }

      continueReduce();
    } else {
      for (i = 0; i < mapKeys.length; i++) {
        var key = mapKeys[i];
        var item = mapDict[key];
        for (var j = 0; j < item.keys.length; j++) {
          var id = item.keys[j];
          var value = item.values[j];
          rows.push({id: id,
                     key: key,
                     value: value});
        }
      }

      doneWithReduce();
    }

    function doneWithReduce() {
      finished({rows: rows});
    }
  }
};
