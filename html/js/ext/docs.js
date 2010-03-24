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

// == Code Illuminated Source Documentation ==
//
// Everything is contained in the {{{App}}} namespace.

var App = {
};

// ** {{{ App.TrivialParser }}} **
//
// This is a trivial parser implementation, which can be used for any file
// that the application doesn't know how to properly parse and render. It just
// outputs the full contents of the file as the code, and the documentation
// states that there's no documentation for the file.

App.TrivialParser = function TrivialParser(pattern) {
  this.pattern = pattern;
};

App.TrivialParser.prototype = {
  // ** {{{ App.TrivialParser.blockify() }}} **
  //
  // Given a string containing the contents of a file, chops the file
  // up into an array of segments containing documentation-code pairs.

  blockify: function TrivialParser_blockify(code) {
    return [{text: "No documentation exists for this file.",
             lineno: 0,
             numLines: 0,
             code: code}];
  },

  // ** {{{ App.TrivialParser.renderDocText() }}} **
  //
  // Given a jQuery and a string containing documentation text, renders
  // the documentation into the jQuery.

  renderDocText: function TrivialParser_renderDocText(jQuery, text) {
    jQuery.text(text);
  },

  // ** {{{ App.TrivialParser.renderCode() }}} **
  //
  // Given a jQuery and a string containing code, renders the code
  // into the jQuery.

  renderCode: function TrivialParser_renderCode(jQuery, code) {
    jQuery.text(code);
  }
};

// ** {{{ App.JsParser }}} **
//
// This is a parser implementation for parsing and rendering JavaScript with
// [[http://wikicreole.org/|WikiCreole]] formatted comments as documentation.

App.JsParser = function JsParser(creole) {
  if (creole)
    this._creole = creole;
};

App.JsParser.prototype = {
  pattern: /.*\.js$/,
  blockify: function JsParser_blockify(code) {
    var lines = code.split('\n');
    var blocks = [];
    var blockText = "";
    var codeText = "";
    var firstCommentLine;
    var lastCommentLine;

    function maybeAppendBlock() {
      if (blockText)
        blocks.push({text: blockText,
                     lineno: firstCommentLine,
                     numLines: lastCommentLine - firstCommentLine + 1,
                     code: codeText});
    }

    jQuery.each(
      lines,
      function(lineNum) {
        var line = this;
        var isCode = true;
        var isComment = (App.trim(line).indexOf("//") == 0);
        if (isComment) {
          var startIndex = line.indexOf("//");
          var text = line.slice(startIndex + 3);
          if (lineNum == lastCommentLine + 1) {
            blockText += text + "\n";
            lastCommentLine += 1;
            isCode = false;
          } else if (text[0] == "=" || text[0] == "*") {
            maybeAppendBlock();
            firstCommentLine = lineNum;
            lastCommentLine = lineNum;
            blockText = text + "\n";
            codeText = "";
            isCode = false;
          }
        }
        if (isCode)
          codeText += line + "\n";
      });
    maybeAppendBlock();

    if (blocks.length)
      return blocks;
    else
      return [{text: "No documentation exists for this file.",
               lineno: 0,
               numLines: 0,
               code: code}];
  },

  renderDocText: function JsParser_renderDocText(jQuery, text) {
    if (!this._creole)
      this._creole = new Parse.Simple.Creole(
        {interwiki: {
           WikiCreole: 'http://www.wikicreole.org/wiki/',
           Wikipedia: 'http://en.wikipedia.org/wiki/'
         },
         linkFormat: ''
        });

    var self = this;
    jQuery.each(function() { self._creole.parse(this, text); });
  },

  renderCode: function JsParser_renderCode(jQuery, code) {
    var self = this;
    jQuery.text(code);
  }
};

// ** {{{ App.parsers }}} **
//
// An array of parser interfaces, from least-specific to
// most-specific. That is, the "default" parser that is used if no
// more specialized parser can be found is the first item in the
// array, followed by the next least specific one, and so on.

App.parsers = [new App.TrivialParser(/.*/),
               new App.JsParser()];

// ** {{{ App.trim() }}} **
//
// Simple utility function to trim whitespace from both sides of a string.

App.trim = function trim(str) {
  return str.replace(/^\s+|\s+$/g,"");
};

// ** {{{ App.processors }}} **
//
// An array of user-defined processor functions.  They should take one
// argument, the DOM node containing the documentation.  User-defined
// processor functions are called after standard processing is done.

App.processors = [];

// Has a {label, urlOrCallback} dict for each keyword.

App.menuItems = {};

// ** {{{ App.getParserForFile() }}} **
//
// Given a filename, attempts to find the best parser for it and
// returns it.

App.getParserForFile = function getParserForFile(filename) {
  for (var i = App.parsers.length - 1; i >= 0; i--)
    if (filename.match(App.parsers[i].pattern))
      return App.parsers[i];
  throw new Error("Parser not found for " + filename);
};

// ** {{{ App.layout() }}} **
//
// Given a parser implementation, a body of text, and a DOM element,
// splits the code from the documentation and lays them out
// side-by-side into the DOM element.

App.layout = function layout(parser, code, div) {
  jQuery.each(
    parser.blockify(code),
    function() {
      var docs = $('<div class="documentation">');
      docs.css(App.columnCss);
      parser.renderDocText(docs, this.text);
      $(div).append(docs);
      var code = $('<div class="code">');
      code.css(App.columnCss);
      parser.renderCode(code, this.code);
      $(div).append(code);

      var docsSurplus = docs.height() - code.height() + 1;
      if (docsSurplus > 0)
        code.css({paddingBottom: docsSurplus + "px"});

      $(div).append('<div class="divider">');
    });

  // Run the user-defined processors.
  jQuery.each(
    App.processors,
    function() {
      this($(div).find(".documentation"));
    });
};

// ** {{{ App.addMenuItem() }}} **
//
// Adds a menu item to the {{{element}}} DOM node showing the {{{label}}}
// text.  If {{{urlOrCallback}}} is an URL, choosing the item causes a new
// window to be opened with that URL.  If it's a function, it will be called
// when choosing the item.
//
// If the node does not have a menu yet, one will be created.

App.addMenuItem = function addMenuItem(element, label, urlOrCallback) {
  var text = $(element).text();

  if (!$(element).parent().hasClass("popup-enabled")) {
    App.menuItems[text] = [];

    $(element).wrap('<span class="popup-enabled"></span>');

    $(element).mousedown(
      function(evt) {
        evt.preventDefault();
        var popup = $('<div class="popup"></div>');

        function addItemToPopup(label, urlOrCallback) {
          var callback;
          var menuItem = $('<div class="item"></div>');
          menuItem.text(label);
          function onOverOrOut() { $(this).toggleClass("selected"); }
          menuItem.mouseover(onOverOrOut);
          menuItem.mouseout(onOverOrOut);
          if (typeof(urlOrCallback) == "string")
            callback = function() {
              window.open(urlOrCallback);
            };
          else
            callback = urlOrCallback;
          menuItem.mouseup(callback);
          popup.append(menuItem);
        }

        jQuery.each(
          App.menuItems[text],
          function() {
            addItemToPopup(this.label, this.urlOrCallback);
          });

        popup.find(".item:last").addClass("bottom");

        popup.css({left: evt.pageX + "px"});
        $(window).mouseup(
          function mouseup() {
            popup.remove();
            $(window).unbind("mouseup", mouseup);
          });
        $(this).append(popup);
      });
  }

  App.menuItems[text].push({ label: label, urlOrCallback: urlOrCallback });
};

// The current page we're on.

App.currentPage = null;

// The current section of the current page we're on.

App.currentSection = null;

// Maps filenames to DOM elements containing the rendered
// documentation and source code for the filename.

App.pages = {};

// ** {{{ App.navigate() }}} **
//
// Navigates to the code/documentation of a different file if
// needed. The appropriate view is fetched from the URL hash. If that
// is empty, the overview is shown.

App.navigate = function navigate() {
  var newPage;
  var section;
  if (window.location.hash)
    newPage = window.location.hash.slice(1);
  else
    newPage = "overview";

  var hashIndex = newPage.indexOf("#");
  if (hashIndex != -1) {
    section = newPage.slice(hashIndex + 1).replace(/_/g, " ");
    newPage = newPage.slice(0, hashIndex);
  }

  function scrollToAnchor() {
    if (section) {
      var anchor;
      $(":header").each(
        function() {
          if ($(this).text() == section && !anchor)
            anchor = this;
        });
      if (anchor)
        window.scroll(0, $(anchor).offset().top);
    } else
      window.scroll(0, 0);
  }

  function onNewPageLoaded() {
    $(App.pages[newPage]).show();
    scrollToAnchor();
  }

  if (App.currentPage != newPage) {
    if (App.currentPage)
      $(App.pages[App.currentPage]).hide();
    App.currentPage = newPage;
    App.currentSection = section;
    if (!App.pages[newPage]) {
      var parser = App.getParserForFile(newPage);
      var newDiv = $("<div>");
      newDiv.attr("name", newPage);
      $("#content").append(newDiv);
      App.pages[newPage] = newDiv;
      jQuery.ajax(
        {url: newPage,
         success: function onCodeLoaded(code) {
           App.layout(parser, code, newDiv);
           onNewPageLoaded();
         },
         error: function onError() {
           newDiv.text("Sorry, couldn't load " + newPage + ".");
         },
         dataType: "text"}
      );
    } else
      onNewPageLoaded();
  } else
    if (App.currentSection != section) {
      App.currentSection = section;
      scrollToAnchor();
    }
};

// ** {{{ App.CHARS_PER_ROW }}} **
//
// Maximum number of characters per row to display on each column. By
// default, this is typographically enforced: any lines that exceed
// this number of characters per row will look bad because of
// overflow, and intentionally so.

App.CHARS_PER_ROW = 80;

// ** {{{ App.initColumnSizes() }}} **
//
// Dynamically initializes the widths of the code and documentation
// columns.

App.initColumnSizes = function initSizes() {
  // Get the width of a single monospaced character of code.
  var oneCodeCharacter = $('<div class="code">M</div>');
  $("#content").append(oneCodeCharacter);
  App.charWidth = oneCodeCharacter.width();
  App.columnWidth = App.charWidth * App.CHARS_PER_ROW;
  $(oneCodeCharacter).remove();

  // Dynamically determine the column widths and padding based on
  // the font size.
  var padding = App.charWidth * 2;
  App.columnCss = {width: App.columnWidth,
                   paddingLeft: padding,
                   paddingRight: padding};
  $("#content").css({width: (App.columnWidth + padding*2) * 2});
  $(".documentation").css(App.columnCss);
  $(".code").css(App.columnCss);
};

// == Initialization ==

$(window).ready(
  function() {
    App.pages["overview"] = $("#overview").get(0);
    App.initColumnSizes();
    window.setInterval(
      function() { App.navigate(); },
      100
    );
    App.navigate();
  });
