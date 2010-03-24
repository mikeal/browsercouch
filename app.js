var couchapp = require('couchapp');

ddoc = {'_id':'_design/app'}

couchapp.loadAttachments(ddoc, __dirname);

exports.app = ddoc;