function map(func, dict) {
  var mapDict = {};
  var currDoc;

  function emit(key, value) {
    var item = mapDict[key];
    if (!item)
      item = mapDict[key] = {keys: [], values: []};
    item.keys.push(currDoc.id);
    item.values.push(value);
  }

  for (key in dict) {
    currDoc = dict[key];
    func(currDoc, emit);
  }

  return mapDict;
}

function onmessage(event) {
  var mapFunc = eval("(" + event.data.map + ")");
  postMessage(map(mapFunc, event.data.dict));
};
