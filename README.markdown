BrowserCouch
============

CouchDB in the browser - persistant, syncing client side storage.
 


Example
-------
 
GET:

    var database = BrowserCouch('foo');
    database.onload(function(){
        database.get('bar', function(d){console.log(d)});
    });
 
 
SYNC

    database.sync('http://localhost:5984/foo', {continuous:true});
    
MAP REDUCE

	var test_data = [
		{_id : "0", hello : 'world'},
		{_id : "1", chunky : 'monkey'},
		{_id : "2", foo : 'bar'},
		{_id : "3", black : 'hat'},
		{_id : "4", black : 'tea'},
		{_id : "5", words : 'two foo three'},
		{_id : "6", words: 'two'}
	];		
	
	var db = BrowserCouch('bar');
	
	db.onload(function(){
		db.put(test_data, function(){});	
	});
	
Some time later ...	
    
	var db = BrowserCouch('bar');
	db.onload(function(){
		
	
	
		db.view({
			map : function(doc, emit){
				if (doc.words){
					var words = doc.words.split(" ");
	    			for (var i = 0; i < words.length; i++)
	      				emit(words[i], 1);
	      		}		
			},
			reduce : function(keys, values){
				var sum = 0;
	    		for (var i = 0; i < values.length; i++)
	      			sum += values[i];
	    		return sum;
	    	},
	    	finished : function(view){
	    		console.log(view.findRow('two')); // Should emit 2
	    	}	
		});
	});	


    
(See the unit tests for more examples)


