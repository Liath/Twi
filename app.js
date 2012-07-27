/*
 * You don't need to edit anything in this file. Go look at settings.js.example.
 */

'use strict';

// Load configuration
var options = require('./settings.js');
options.version = 'v0.0.4';

/**
 * Module dependencies.
 */
var express = require('express')
  , Db = require('mongodb').Db
  , Server = require('mongodb').Server
  , ImageProvider = require('./lib/mongodb/imageProvider').ImageProvider
  , AliasProvider = require('./lib/mongodb/aliasProvider').AliasProvider
  , TagProvider = require('./lib/mongodb/tagProvider').TagProvider
  , UserProvider = require('./lib/mongodb/userProvider').UserProvider
  , WikiProvider = require('./lib/mongodb/wikiProvider').WikiProvider
  , CommentProvider = require('./lib/mongodb/commentProvider').CommentProvider
  , ImplicationProvider = require('./lib/mongodb/implicationProvider').ImplicationProvider
  , FileProvider = require('./lib/upload/'+options.upload.method+'.js').Storage
  , passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy
  , flash = require('connect-flash');

if  (options.redis) {
    var RedisStore = require("connect-redis")(express);
}

//App setup
var app = module.exports = express.createServer();
app.twi = {};
app.twi.options = options;

//Providers
var db = new Db(app.twi.options.database.name, new Server(app.twi.options.database.host, app.twi.options.database.port, {auto_reconnect: true}, {}));
db.open(function(){
    db.authenticate(app.twi.options.database.user, app.twi.options.database.pass, function(error) {
        if (error) console.log('DB Auth Error (app.js:38)'+error);
        var getUniqueId = function(){
            while(true){
                var rand=(Math.floor(Math.random()*1000)+(new Date()).getTime()).toString(16);
                //If we find a number that doesn't return a result, break cause THUNDERCATS HO!
                if (!db.images.findOne({a:rand},{_id:1}) || db.images.findOne({a:rand},{_id:1}) === null) break;
            }
            return rand;
        };
        db.eval('var func = '+getUniqueId.toString()+' db.code.insert({"_id" : "getUniqueId", "value" : func });', function() {});
    });
});
app.providers = {};
app.providers.commentProvider = new CommentProvider(db);
app.providers.fileProvider = new FileProvider(app.twi.options);
app.providers.imageProvider= new ImageProvider(db, app.twi.options.resultsPerPage);
app.providers.aliasProvider = new AliasProvider(db);
app.providers.tagProvider = new TagProvider(db);
app.providers.userProvider = new UserProvider(db);
app.providers.wikiProvider = new WikiProvider(db);
app.providers.implicationProvider = new ImplicationProvider(db);
app.db = db;

function setup() {
    return function (req, res, next) {
        //Template globals
        res.locals.session = req.session;
        res.locals.board = {
            name    : app.twi.options.name,
            domain  : app.twi.options.domain,
            version : app.twi.options.version
        };
        res.locals.board.authenticated = false;
        if (req.isAuthenticated()) {
            res.locals.board.authenticated = true;
            res.locals.board.user = req.user;
        }
        res.locals.board.flash = {
            error : req.flash('error'),
            info : req.flash('info')
        };

        for( var i =0;i< res.locals.board.flash.length;i++ ) {
            console.log('FlashMsg Error: '+res.locals.board.flash[i]);
        }
        res.locals.board.uploadMethod = app.twi.options.upload.method;

        next();
    }
}
app.configure('all', function(){
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');

    app.use(express.bodyParser(
      {
        uploadDir: ((app.twi.options.upload.method == "direct") ? app.twi.options.upload.paths.temp : null)
      }
    ));

    app.use(express.methodOverride());
    app.use(express.cookieParser(app.twi.options.sessionKey));

    if  (app.twi.options.redis) {
        if (app.settings.env == 'production') {
            var conf = {
                h: false, //Host
                t: false, //Port
                d: false, //Db
                s: false  //Pass
            };
            if (process.env.REDISTOGO_URL) {
                var url = require('url'),
                    redisUrl = url.parse(process.env.REDISTOGO_URL),
                    redisAuth = redisUrl.auth.split(':');
                conf.h = redisUrl.hostname;
                conf.t = redisUrl.port;
                conf.d = redisAuth[0];
                conf.s = redisAuth[1];
            } else if (app.twi.options.redis.host) {
                conf.h = app.twi.options.redis.host;
                conf.t = app.twi.options.redis.port;
                conf.d = app.twi.options.redis.db;
                conf.s = app.twi.options.redis.pass;
            }
            app.use(express.session({
                store: new RedisStore({
                    host : conf.h,
                    port : conf.t,
                    db   : conf.d,
                    pass : conf.s
                })
            }));
        } else {
            if (app.twi.options.redis && app.twi.options.redis.host) {
                app.use(express.session({
                    store: new RedisStore({
                        host : app.twi.options.redis.host,
                        port : app.twi.options.redis.port,
                        db   : app.twi.options.redis.db,
                        pass : app.twi.options.redis.pass
                    })
                }));
            } else {
                app.use(express.session({ store: new RedisStore }));
            }
        }
    } else {
        app.use(express.session());
    }
    app.use(flash());
    app.use(passport.initialize());
    app.use(passport.session());

    app.use(setup());//Setup Twi

    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
    app.use(express.errorHandler());
});

passport.use(new LocalStrategy(
    function(username, password, done) {
        app.providers.userProvider.findOne({ username: username }, function (err, user) {
            if (err) { return done(err); }
            if (!user) {
                return done(null, false, { message: 'Unknown user' });
            }
            if (user.t) return done(null, false, { message: 'You must verify your account before you can log in.' });
            if (!app.providers.userProvider.validate(user, password)) {
                return done(null, false, { message: 'Invalid password' });
            }
            return done(null, user);
        });
    }
));
passport.serializeUser(function(user, done) {
    done(null, user._id);
});
passport.deserializeUser(function(id, done) {
    app.providers.userProvider.findById(id, function (err, user) {
        done(err, user);
    });
});

//Include the routes
require('./lib/routes/index')(app);
//Except this one because passport is here and it would be silly and wasteful to ship it elsewhere
app.post('/login',
    passport.authenticate('local', {
        failureRedirect: '/login',
        failureFlash: 'Login failed.',
        successRedirect: '/post',
        successFlash: 'You have been logged in.'
    })
);

// Cron
setInterval(function() {
    app.providers.userProvider.reaper(function(error){
        if (error) console.log('User Reaper Error (app.js:205): '+error);
    });
    app.providers.tagProvider.reaper(function(error){
        if (error) console.log('Tag Reaper Error (app.js:208): '+error);
    });
},3600000); //One hour

//Boot
var port = process.env.PORT || 3000;
app.listen(port, function(){
    console.log("Twi booting on port %s in %s mode", port, app.settings.env);
});