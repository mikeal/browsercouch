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
