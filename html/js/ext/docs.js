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
 *   Sander Dijkhuis <sander.dijkhuis@gmail.com>
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

// = App =
//
// This is the application that processes the code and lets the user
// navigate through and read the documentation.

var App = {
  options : {}
};

// ** {{{ App.trim() }}} **
//
// Returns {{{str}}} without whitespace at the beginning and the end.

App.trim = function trim(str) {
  return str.replace(/^\s+|\s+$/g,"");
};

// ** {{{ App.processors }}} **
//
// An array of user-defined processor functions.  They should take one
// argument, the DOM node containing the documentation.  User-defined
// processor functions are called after standard processing is done.

App.processors = [];

App.menuItems = {};   // Has a {label, urlOrCallback} dict for each keyword.

// ** {{{ App.processCode() }}} **
//
// Splits {{{code}}} in documented blocks and puts them in {{{div}}}.
// The used structure for each block is:
// {{{
// <div class="documentation"> (...) </div>
// <div class="code"> (...) </div>
// <div class="divider"/>
// }}}
// Documentation is parsed using [[http://wikicreole.org/|Creole]].

App.processCode = function processCode(code, div) {
  var lines = code.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  var blocks = [];
  var blockText = "";
  var codeText = "";
  var firstCommentLine;
  var lastCommentLine;
  var _lineNum;

  function maybeAppendBlock() {
    if (blockText){
      blocks.push({text: blockText,
                   lineno: firstCommentLine,
                   numLines: lastCommentLine - firstCommentLine + 1,
                   lastCode : _lineNum,
                   code: codeText});
    } else if(codeText){
      blocks.push({text: "~ ",
                   lineno: 0,
                   numLines: 0,
                   lastCode : _lineNum,
                   code: codeText});
    
    }
                    
  }

  jQuery.each(
    lines,
    function(lineNum) {
      _lineNum = lineNum;
      var line = this;
      var isCode = true;
      var isComment = (App.trim(line).indexOf("//") == 0);
      if (isComment) {
        var startIndex = line.indexOf("//");
        var text = App.trim(line.slice(startIndex + 3));
        if (lineNum == lastCommentLine + 1) {
          blockText += text + "\n";
          lastCommentLine += 1;
          isCode = false;
        } else if (text.charAt(0) == "=" || text.charAt(0) == "*") {
          maybeAppendBlock();
          firstCommentLine = lineNum;
          lastCommentLine = lineNum;
          blockText = text + "\n";
          codeText = "";
          isCode = false;
        }
      }
      if (isCode)
        codeText += line + "\r\n";
    });
  maybeAppendBlock();

  var creole = new Parse.Simple.Creole(
    {
      forIE: document.all,
      interwiki: {
        WikiCreole: 'http://www.wikicreole.org/wiki/',
        Wikipedia: 'http://en.wikipedia.org/wiki/'
      },
      linkFormat: ''
    });
  
  var cont = [];
  var headers = ['h1', 'h2', 'h3', 'h4', "strong"];
  
  jQuery.each(
    blocks,
    function(i) {
      var docs = $('<div class="documentation">');
      docs.css(App.columnCss);
      creole.parse(docs.get(0), this.text);
      
      for(var h in headers){
        var hd = headers[h];
        if (docs.find(hd).length > 0){
          var titl = docs.find(hd)
          titl.attr('id', titl.text().replace(" ", "_"));
          cont.push([titl.attr('id'), hd, titl]);
        }
      }
      $(div).append(docs);
      var num = $('<div class = "nums">');
      for (var x = this.lineno + this.numLines +1; x<this.lastCode; x++){
        num.append(x + '\n');
      }
      $(div).append(num);
      var code = $('<code class="code prettyprint">');
      $(code).css(App.columnCss);
      code.text(this.code);
      $(div).append(code);

      var docsSurplus = docs.height() - code.height() + 1;
      if (docsSurplus > 0){
        code.css({paddingBottom: docsSurplus + "px"});
        num.css({paddingBottom: docsSurplus + "px"})
      }
      $(div).append('<div class="divider">');
    });

  // Run the user-defined processors.
  jQuery.each(
    App.processors,
    function(i) {
      App.processors[i]($(div).find(".documentation"));
    });
    
  // == Table Of Contents ==
  var ul = $("<ul class = 'toc' />");
  for (var k in cont){
    var ln = $("<li class = '" + cont[k][1] + "'>" +
      "<span class = 'pseudo-link' href = '" + cont[k][0] +
      "'>" + cont[k][2].text() + "</span></li>");
    ul.append(ln);
  }
  //div.prepend(ul);
     
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
          function(i) {
            var item = App.menuItems[text][i];
            addItemToPopup(item.label, item.urlOrCallback);
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

App.currentPage = null;

App.pages = {};

// ** {{{ App.navigate() }}} **
//
// Navigates to a different view if needed.  The appropriate view is
// fetched from the URL hash.  If that is empty, the original page content
// is shown.

App.navigate = function navigate() {
  var newPage;
  if (window.location.hash)
    newPage = window.location.hash.slice(1);
  else
    newPage = "overview";

  if (App.currentPage != newPage) {
    if (App.currentPage)
      $(App.pages[App.currentPage]).hide();
    if (!App.pages[newPage]) {
      var newDiv = $("<div>");
      newDiv.attr("name", newPage);
      $("#content").append(newDiv);
      App.pages[newPage] = newDiv;
      jQuery.get(newPage,
                 {},
                 function(code) { 
                   App.processCode(code, newDiv);
                   prettyPrint();},
                 "text");
    }
    $(App.pages[newPage]).show();
    App.currentPage = newPage;
  }
};

App.CHARS_PER_ROW = 80;

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
  $("#content").css({width: (App.columnWidth + padding*2) * 2 + (3*App.charWidth)});
  $(".documentation").css(App.columnCss);
  $(".code").css(App.columnCss);
  $(".nums").css({width : 3*App.charWidth});
};

$(function() {
  $('.pseudo-link').live('click', function(){
    console.log(this);
  });
  $.getScript('js/ext/prettify.js', function(success){
    App.pages["overview"] = $("#overview").get(0);
    App.initColumnSizes();
    window.setInterval(
      function() {
        App.navigate();
        },
      100
     );
    App.navigate();
  });
});
