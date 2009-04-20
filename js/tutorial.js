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
    $(oneCodeCharacter).remove();

    // Set the width of the content to be the maximum number of
    // characters of code that can fit on a line.
    $('#content').css({width: charWidth * CHARS_PER_ROW});
    $('#content').fadeIn();

    // Iterate through all the code snippets and trim them.
    var allCode = '';
    $('.example-code').each(
      function() {
        var code = $(this).text();
        allCode += code;
        $(this).text(jQuery.trim(code));
      });

    // Now execute all the code snippets.
    var dataUri = 'data:text/javascript,' + encodeURI(allCode);
    var script = document.createElement('script');
    script.setAttribute('src', dataUri);
    document.body.appendChild(script);
  });
