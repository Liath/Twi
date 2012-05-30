/*
 * MongoDB Backend for Images
 *
 * Images
 *  f: filePath
 *  d: source path
 *  m: metadata
 *  Exif/Created/Perhaps region info for tagging and commenting on parts of an image
 *  image size, posters name, content rating - Eg, Mature/Teen
 *  t: tags
 *  u: timestamp
 *  n: thumbnail
 *  i: md5
 *  r: Peer rating
 *  v: views
 *  a: numeric post id
 *  ci: comments count / incrementor for ids
 *  c: comments
 *      i: id, just an incrementor
 *      a: author
 *      m: message
 *      t: time
 *      r: rating (up/down votes)
 */

var resultsLimit = 15;
var imgRegex = /^[0-9a-f]{32}$/i;
var tagRegex = /^[0-9a-z_\(\)]+$/i;
var index = {
    current: false,
    list: {}
}

ImageProvider = function(database, resultsPerPage) {
    resultsLimit = resultsPerPage;
    this.db = database;
};

ImageProvider.prototype.getCollection= function(callback) {
    this.db.collection('images', function(error, image_collection) {
        if( error ) callback(error);
        else callback(null, image_collection);
    });
};

ImageProvider.prototype.getIndexPage= function(page, count, callback) {
    this.getCollection(function(error, image_collection) {
        if( error ) callback(error)
        else {
            if (page != null && page > 0) {
                page = 1;
            }
            if (count != null && count > 0) {
                count = resultsLimit;
            }
            image_collection.find().skip((page-1)*count).limit(count).toArray(function(error, results) {
                if( error ) callback(error);
                else callback(null, results);
            });
        }
    });
};

ImageProvider.prototype.getByTag= function(tag,  page, count, callback) {
    if (tagRegex.test(id)) {
        this.getCollection(function(error, image_collection) {
            if( error ) callback(error)
            else {
                if (page != null && page > 0) {
                    page = 1;
                }
                if (count != null && count > 0) {
                    count = resultsLimit;
                }
                image_collection.find( { t : tag } ).skip((page-1)*count).limit(count).toArray(function(error, results) {
                    if( error ) callback(error);
                    else callback(null, results);
                });
            }
        });
    } else {
        callback("Invalid Tag");
    }
};

ImageProvider.prototype.getImage= function(id, callback) {
    if (imgRegex.test(id)) {
        this.getCollection(function(error, image_collection) {
            if( error ) callback(error)
            else {
                image_collection.findOne({i : id}, function(error, result) {
                    if( error ) callback(error);
                    else {
                        image_collection.update({ _id : result._id }, {$inc : { v : 1 }});
                        callback(null, result);
                    }
                });
            }
        });
    } else {
        callback("Invalid Image");
    }
};

ImageProvider.prototype.getCount= function(callback) {
    this.getCollection(function(error, image_collection) {
        if( error ) callback(error)
        else {
            image_collection.count(function(error, result) {
                if( error ) callback(error);
                else {
                    callback(null, result);
                }
            });
        }
    });
};

ImageProvider.prototype.submitImages = function(images, callback) {
    this.getCollection(function(error, image_collection) {
        if( error ) callback(error)
        else {
            if( typeof(images.length)=="undefined")
                images = [images];

            inserts = [];
            for( var i =0;i< images.length;i++ ) {
                image = images[i];
                if (image.f === undefined || image.n === undefined || image.i === undefined) continue;
                if (image_collection.findOne({ i : image.i }) !== null) continue;
                image.u = new Date();
                image.c = [];
                image.ci = 0;
                image.r = 0;
                image.v = 0;
                if( image.t === undefined ) image.t = [];
                if( image.m === undefined ) image.m = { views : 0 };
                inserts.push(image);
            }

            if (inserts.length > 0) {
                image_collection.insert(inserts, function(err, results) {
                    callback(null, results);
                });
            } else {
                callback("No images were added.");
            }
        }
    });
};

ImageProvider.prototype.addComment = function(id, comment, callback) {
    if (imgRegex.test(id)) {
        this.getCollection(function(error, image_collection) {
            if( error ) callback(error)
            else {
                image = image_collection.findOne({i : id});
                if (image !== null) {
                    image_collection.update({ _id : image._id }, {$inc : { ci : 1}, $push : { c : comment }}, {safe:true}, function(err, result) {
                        if( error ) callback(error)
                        else callback(null, result);
                    });
                } else {
                    callback("Image not found?");
                }
            }
        });
    } else {
        callback("Invalid Image");
    }
}

ImageProvider.prototype.addTag = function(id, tag, callback) {
    if (imgRegex.test(id)) {
        this.getCollection(function(error, image_collection) {
            if( error ) callback(error)
            else {
                image = image_collection.findOne({i : id});
                if (image !== null) {
                    image_collection.update({ _id : image._id }, { $push : { t : tag }}, {safe:true}, function(err, result) {
                        if( error ) callback(error)
                        else callback(null, result);
                    });
                } else {
                    callback("Image not found?");
                }
            }
        });
    } else {
        callback("Invalid Image");
    }
}

ImageProvider.prototype.ratingChange = function(id, direction, callback) {
    if (imgRegex.test(id)) {
        this.getCollection(function(error, image_collection) {
            if( error ) callback(error)
            else {
                image = image_collection.findOne({i : id});
                if (image !== null) {
                    vote = (direction) ?  1 : -1;
                    image_collection.update({ _id : image._id }, { $inc : { v : vote }}, {safe:true}, function(err, result) {
                        if( error ) callback(error)
                        else callback(null, result);
                    });
                } else {
                    callback("Image not found?");
                }
            }
        });
    } else {
        callback("Invalid Image");
    }
}

exports.ImageProvider = ImageProvider;