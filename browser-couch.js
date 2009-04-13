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

var BrowserCouch = {
  get: function BC_get(name, cb, storage, JSON) {
    var self = this;

    function createDb() {
      cb(new self._DB(name, storage, new self._Dictionary(JSON)));
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

  _Dictionary: function BC__Dictionary(JSON) {
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

    this.toJSON = function Dictionary_toJSON() {
      return JSON.stringify(dict);
    };

    this.fromJSON = function Dictionary_fromJSON(string) {
      dict = JSON.parse(string);
      regenerateKeys();
    };
  },

  _DB: function BC__DB(name, storage, dict) {
    var dbName = 'BrowserCouch_DB_' + name;

    if (dbName in storage && storage[dbName].value)
      dict.fromJSON(storage[dbName].value);

    function commitToStorage() {
      storage[dbName] = dict.toJSON();
    }

    this.wipe = function DB_wipe(cb) {
      dict.clear();
      commitToStorage();
      if (cb)
        cb();
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

      commitToStorage();
      cb();
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

      BrowserCouch._mapReduce(options.map,
                              options.reduce,
                              dict,
                              options.progress,
                              options.finished,
                              options.chunkSize);
    };
  },

  _mapReduce: function BC__mapReduce(map, reduce, dict, progress,
                                     finished, chunkSize) {
    var mapDict = {};
    var mapKeys = [];
    var keys = dict.getKeys();
    var rows = [];
    var currDoc;

    function emit(key, value) {
      // TODO: This assumes that the key will always be
      // an indexable value. We may have to hash the value,
      // though, if it's e.g. an Object.
      if (!(key in mapDict)) {
        mapKeys.push(key);
        mapDict[key] = {keys: [], values: []};
      }
      mapDict[key].keys.push([key, currDoc.id]);
      mapDict[key].values.push(value);
    }

    // Maximum number of items to process before giving the UI a chance
    // to breathe.
    var DEFAULT_CHUNK_SIZE = 1000;

    // If no progress callback is given, we'll automatically give the
    // UI a chance to breathe for this many milliseconds before continuing
    // processing.
    var DEFAULT_UI_BREATHE_TIME = 50;

    if (!chunkSize)
      chunkSize = DEFAULT_CHUNK_SIZE;
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
        doReduce();
      else {
        if (progress)
          progress("map", i / keys.length, continueMap);
        else
          window.setTimeout(continueMap, DEFAULT_UI_BREATHE_TIME);
      }
    }

    continueMap();

    function doReduce() {
      if (reduce) {
        var i = 0;

        function continueReduce() {
          var iAtStart = i;

          do {
            var key = mapKeys[i];
            var item = mapDict[key];
            rows.push({key: key,
                       value: reduce(item.keys, item.values)});
            i++;
          } while (i - iAtStart < chunkSize &&
                   i < mapKeys.length)

          if (i == mapKeys.length)
            doSort();
          else {
            if (progress)
              progress("reduce", i / mapKeys.length, continueReduce);
            else
              window.setTimeout(continueReduce, DEFAULT_UI_BREATHE_TIME);
          }
        }

        continueReduce();
      } else {
        for (i = 0; i < mapKeys.length; i++) {
          var key = mapKeys[i];
          var item = mapDict[key];
          for (var j = 0; j < item.keys.length; j++) {
            var id = item.keys[j][1];
            var value = item.values[j];
            rows.push({id: id,
                       key: key,
                       value: value});
          }
        }

        doSort();
      }
    }

    function doSort() {
      rows.sort(function compare(a, b) {
                  if (a.key < b.key)
                    return -1;
                  if (a.key > b.key)
                    return 1;
                  return 0;
                });
      finished({rows: rows});
    }
  }
};
