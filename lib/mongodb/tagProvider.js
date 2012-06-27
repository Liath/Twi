/*
 * MongoDB Backend for Tags
 *
 * Tags
 * n: name
 * p: pretty name
 * d: source
 * u: timestamp
 * m: array: random/unsure
 * a: array: aliases
 * c: count of posts using this tag
 *
 * TODO: Edit tag, handle c: and p:
 */

var tagRegex = /^[0-9a-z\(\)-]+$/i;
var resultsLimit = 30;

TagProvider = function(database) {
    this.db= database;
    // Keeps track of whether or not the local list of tags is up to date
    this.current = false;
    // List of all tag data
    this.list = [];
    // Small list of tags with just their slug
    this.smallList = [];
    // Pool of callbacks waiting on a rebuild, I don't even know if one instance can respond to anothers requests
    this.gtPool = [];                           // So this will be fun...
    // Flag that says getTags is rebuilding
    this.rebuild = false;
    // Timestamp of last rebuild
    this.rebuildExpire = Math.round((new Date()).getTime() / 1000);
    // Rebuild every x seconds. This would be better moved to something like redis so all threads can share an update
    this.rebuildTime = 10;
};

TagProvider.prototype.getCollection= function(callback) {
    this.db.collection('tags', function(error, tag_collection) {
        if( error ) callback(error);
        else callback(null, tag_collection);
    });
};

TagProvider.prototype.getTagList= function(page, count, callback) {
    this.getCollection(function(error, tag_collection) {
        if( error ) callback(error)
        else {
            if (page != null && page > 0) {
                page = 1;
            }
            if (count != null && count > 0) {
                count = resultsLimit;
            }
            tag_collection.find({}, {_id:0}).skip((page-1)*count).limit(count).toArray(function(error, results) {
                if( error ) callback(error);
                else callback(null, results);
            });
        }
    });
};

TagProvider.prototype.getTags= function(callback) {
    if (this.current && ((Math.round((new Date()).getTime() / 1000)) - this.rebuildExpire) < this.rebuildTime) callback(null, this.list);
    else {
        if (this.rebuild) {
            this.gtPool.push(callback);
            return;
        }
        this.rebuild = true;
        this.list = {};
        this.smallList = [];
        var that = this;
        this.getTagList(1,0, function(error, result) {
            for (var i = 0; i < result.length; i++) {
                that.list[result[i].n] = result[i];
            }
            for (tag in that.list) {
                that.smallList.push(tag.n);
            }
            that.current = true;
            that.rebuild = false;
            that.rebuildExpire = Math.round((new Date()).getTime() / 1000);
            callback(error, that.list, that.smallList);
            for(call in that.gtPool) {
                call(error, that.list, that.smallList);
            }
            that.gtPool = [];
        });
    }
}

TagProvider.prototype.getInfo= function(search, callback) {
    var tags = [];
    if (Array.isArray(search)) {
        for( var i =0;i< search.length;i++ ) {
            if (tagRegex.test(search[i])) {
                tags.push(search[i]);
            }
        }
    } else {
        if (tagRegex.test(search)) {
            tags.push(search)
        }
    }
    if (tags.length > 0) {
        //Lets getTags decide if a database call is needed.
        this.getTags(function(error, taglist){
            var resp = [];
            for (var i = 0; i < tags.length; i++) {
                resp.push(taglist[tags[i]]);
            }
            if( error ) callback(error);
            else callback(null, resp);
        });

        //Does a complete call every time
        /*this.getCollection(function(error, tag_collection) {
            if( error ) callback(error)
            else {
                tag_collection.find({n : {$in : search}}).toArray(function(error, result) {
                    if( error ) callback(error);
                    else callback(null, result);
                });
            }
        });*/
    } else {
        callback("Invalid Tag name");
    }
};


//Probably convert this into an edit function for wiki-ish purposes
/*TagProvider.prototype.create= function(name, description, author, callback) {
    if (tagRegex.test(name)) {
        this.current = false;
        this.getCollection(function(error, tag_collection) {
            if( error ) callback(error)
            else {
                tag_collection.findOne({n : name}, function(error, result) {
                    if( error ) callback(error);
                    else if (result !== null) {
                        tag = {n: name, d: description, u: new Date(), m: {a: author}, a: []};
                        tag_collection.insert(tag, function() {
                            callback(null, tag);
                        });
                    } else {
                        callback("Tag already exists");
                    }
                });
            }
        });
    } else {
        callback("Invalid Tag name");
    }
};*/


TagProvider.prototype.checkTag = function(tag, callback) {
    if (tagRegex.test(tag.n)) {
        var that = this;
        this.getTags(function(error, taglist, smallList) {
            if (smallList.indexOf(tag.n) == -1) {
                that.getCollection(function(error, tag_collection) {
                    //  -
                    tag.u = (tag.u) ? tag.u : new Date();
                    //
                    tag.m = (tag.m) ? tag.m : {};
                    tag.a = (tag.a) ? tag.a : [];
                    tag.d = (tag.d) ? tag.d : '';
                    //  Bro? :P

                    tag.c = (tag.c) ? tag.c : 0;

                    tag_collection.insert(tag, function(error, result){
                        if (result) {
                            that.current = false;
                        }
                        if (callback) callback(error, result);
                    });
                });
            } else {
                if (callback) callback(null, null);
            }
        });
    }
}

TagProvider.prototype.rebuildCount = function(callback) {
    var that = this;
    this.db.collection('images', function(error, image_collection) {
        var map=function(){this.t.forEach(function(a){emit(a,1)})},
            red=function(a,c){var b=0;c.forEach(function(){++b});return b},
            prs=function(){
                db.tagData.find().forEach(function(v){
                    db.tags.update({n:v._id}, {$set:{c:v.value}}, {'upsert':1});
                });
            };

        image_collection.mapReduce(map, red, {out: {merge:"tagData"}}, function(error, result){
            if (error) callback(error);
            else {
                that.db.eval(prs.toString(), {}, {nolock:1}, function(error, result) {
                    if (error) callback(error);
                    else {
                        callback(null, result);
                    }
                });
            }
        });

    });
}

exports.TagProvider = TagProvider;