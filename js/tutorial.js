// Helper function that displays a JSON-encodable object in a DOM element.
function displayInElement(obj, id) {
  ModuleLoader.require(
    'JSON',
    function() {
      $('#' + id).text(JSON.stringify(obj, null, 2));
    });
}

$(window).ready(
  function() {
    var CHARS_PER_ROW = 80;

    // Get the width of a single monospaced character of code.
    var oneCodeCharacter = $('<span class="example-code">M</span>');
    $(document.body).append(oneCodeCharacter);
    var charWidth = oneCodeCharacter.width();
    var charHeight = oneCodeCharacter.height();
    var columnWidth = charWidth * CHARS_PER_ROW;
    $(oneCodeCharacter).remove();

    // Set the width of the content to be the maximum number of
    // characters of code that can fit on a line.
    $('#content').width(columnWidth);

    // Set up the code editor.
    $('.try-code').width(columnWidth);
    var tryCodeLines = $('.try-code').text().split('\n').length + 1;
    $('.try-code').height(charHeight * tryCodeLines);

    function executeTryCode() {
      $('#try-my-view').text('');
      var code = $('.try-code').val();
      eval(code);
    }

    $('.try-code').blur(executeTryCode);
    $('#content').fadeIn();

    // Iterate through all the code snippets, gather them for
    // execution, and trim them for display.
    var snippets = [];
    var DONE_FUNC_NAME = 'DONE';
    var DONE_FUNC_CALL = 'DONE();';
    $('.example-code').each(
      function() {
        var code = $(this).val() || $(this).text();
        if (code.indexOf(DONE_FUNC_CALL) == -1)
          code += DONE_FUNC_CALL;
        var snippet = {code: code};
        snippets.push(snippet);
        code = code.replace(DONE_FUNC_CALL, '');
        code = jQuery.trim(code);
        if ($(this).val())
          $(this).val(code);
        else
          $(this).text(code);
      });

    snippets.reverse();

    // Now execute all the code snippets.
    function executeNextSnippet() {
      if (snippets.length) {
        var snippet = snippets.pop();
        var dataUri = 'data:text/javascript,' + encodeURI(snippet.code);
        var script = document.createElement('script');
        script.setAttribute('src', dataUri);
        document.body.appendChild(script);
      }
    }

    window[DONE_FUNC_NAME] = executeNextSnippet;

    executeNextSnippet();
  });
