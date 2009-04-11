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
    var keysAndValues = [];
    var keyIndex = {};

    function sort() {
      keyIndex = {};
      keysAndValues.sort(function compare(a, b) {
                           if (a[0] < b[0])
                             return -1;
                           if (a[0] > b[0])
                             return 1;
                           return 0;
                         });
      for (var i = 0; i < keysAndValues.length; i++) {
        var tuple = keysAndValues[i];
        keyIndex[tuple[0]] = i;
      }
    }

    this.has = function Dictionary_has(key) {
      return (key in keyIndex);
    };

    this.getNthValue = function Dictionary_getNthValue(index) {
      return keysAndValues[index][1];
    };

    this.getLength = function Dictionary_getLength() {
      return keysAndValues.length;
    };

    this.get = function Dictionary_get(key) {
      return keysAndValues[keyIndex[key]][1];
    };

    this.set = function Dictionary_set(key, value) {
      if (key in keyIndex)
        keysAndValues[keyIndex[key]][1] = value;
      else {
        keysAndValues.push([key, value]);
        sort();
      }
    };

    this.delete = function Dictionary_delete(key) {
      keysAndValues.splice(keyIndex[key], 1);
      sort();
    };

    this.clear = function Dictionary_clear() {
      keysAndValues = [];
      keyIndex = {};
    };

    this.toJSON = function Dictionary_toJSON() {
      return JSON.stringify({keysAndValues: keysAndValues,
                             keyIndex: keyIndex});
    };

    this.fromJSON = function Dictionary_fromJSON(string) {
      var obj = JSON.parse(string);
      keysAndValues = obj.keysAndValues;
      keyIndex = obj.keyIndex;
    };
  },

  _DB: function BC__DB(name, storage, dict) {
    var dbName = 'BrowserCouch_DB_' + name;

    if (dbName in storage && storage[dbName].value)
      dict.fromJSON(storage[dbName].value);

    function commitToStorage() {
      storage[dbName].value = dict.toJSON();
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
    var len = dict.getLength();
    var mapKeys = {};
    var mapValues = {};
    var currDoc;

    function emit(key, value) {
      // TODO: This assumes that the key will always be
      // an indexable value. We may have to hash the value,
      // though, if it's e.g. an Object.
      if (!mapKeys[key]) {
        mapKeys[key] = [];
        mapValues[key] = [];
      }
      mapKeys[key].push([key, currDoc.id]);
      mapValues[key].push(value);
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
        currDoc = dict.getNthValue(i);
        map(currDoc, emit);
        i++;
      } while (i - iAtStart < chunkSize &&
               i < len)

      if (i == len)
        doReduce();
      else {
        if (progress)
          progress(i / len, continueMap);
        else
          window.setTimeout(continueMap, DEFAULT_UI_BREATHE_TIME);
      }
    }

    continueMap();

    function doReduce() {
      var reduceResult;
      if (reduce) {
        reduceResult = {};
        for (key in mapKeys) {
          reduceResult[key] = reduce(mapKeys[key],
                                     mapValues[key]);
        }
      } else {
        reduceResult = [];
        for (key in mapValues)
          for (var i = 0; i < mapValues[key].length; i++)
            reduceResult.push([key, mapValues[key][i]]);
      }
      finished(reduceResult);
    }
  }
};
