var express = require('express');
var app = express();

var database = require('./database');
var readDocument = database.readDocument;
var addDocument = database.addDocument;
var writeDocument = database.writeDocument;

var StatusUpdateSchema = require('./schemas/statusupdate.json');
var validate = require('express-jsonschema').validate;
var commentSchema = require('./schemas/comments.json');

var bodyParser = require('body-parser');
app.use(bodyParser.text());
app.use(bodyParser.json());

app.use(express.static('../client/build'));

function getFeedItemSync(feedItemId) {
  var feedItem = readDocument('feedItems', feedItemId);
  // Resolve 'like' counter.
  feedItem.likeCounter = feedItem.likeCounter.map((id) => readDocument('users', id));
  // Assuming a StatusUpdate. If we had other types of FeedItems in the DB, we would
  // need to check the type and have logic for each type.
  feedItem.contents.author = readDocument('users', feedItem.contents.author);
  // Resolve comment author.
  feedItem.comments.forEach((comment) => {
    comment.author = readDocument('users', comment.author);
  });
  return feedItem;
}

/**
 * Emulates a REST call to get the feed data for a particular user.
 */
function getFeedData(user) {
  var userData = readDocument('users', user);
  var feedData = readDocument('feeds', userData.feed);
  // While map takes a callback, it is synchronous, not asynchronous.
  // It calls the callback immediately.
  feedData.contents = feedData.contents.map(getFeedItemSync);
  // Return FeedData with resolved references.
  return feedData;
}

app.get('/user/:userid/feed', function(req, res) {
// URL parameters are stored in req.params
var userid = req.params.userid;
// Send response.
res.send(getFeedData(userid));
});

function getUserIdFromToken(authorizationLine) {
  try {
    var token = authorizationLine.slice(7);

    var regularString = new Buffer(token, 'base64').toString('utf8');

    var tokenObj = JSON.parse(regularString);
    var id = tokenObj['id'];

    if (typeof id === 'number') {
      return id;
    } else {

      return -1;
    }
  } catch (e) {

    return -1;
  }
}

app.get('/user/:userid/feed', function(req, res) {
  var userid = req.params.userid;
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var useridNumber = parseInt(userid, 10);
  if (fromUser === useridNumber) {

    res.send(getFeedData(userid));
  } else {

    res.status(401).end();
  }
});

function postStatusUpdate(user, location, contents) {
  var time = new Date().getTime();

  var newStatusUpdate = {
    "likeCounter": [],
    "type": "statusUpdate",
    "contents": {
      "author": user,
      "postDate": time,
      "location": location,
      "contents": contents,
      "likeCounter": []
    },
    "comments": []
  };

  newStatusUpdate = addDocument('feedItems', newStatusUpdate);

  var userData = readDocument('users', user);
  var feedData = readDocument('feeds', userData.feed);
  feedData.contents.unshift(newStatusUpdate._id);

  writeDocument('feeds', feedData);

  return newStatusUpdate;
}

app.post('/feeditem', validate({ body: StatusUpdateSchema }), function(req, res) {
  var body = req.body;
  var fromUser = getUserIdFromToken(req.get('Authorization'));

  if (fromUser === body.userId) {
    var newUpdate = postStatusUpdate(body.userId, body.location,
      body.contents);
      res.status(201);
      res.set('Location', '/feeditem/' + newUpdate._id);
      res.send(newUpdate);
    } else {

      res.status(401).end();
    }
});

app.post('/resetdb', function(req, res) {
  console.log("Resetting database...");
  database.resetDatabase();
  res.send();
});

app.put('/feeditem/:feeditemid/content', function(req, res) {
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var feedItemId = req.params.feeditemid;
  var feedItem = readDocument('feedItems', feedItemId);

  if (fromUser === feedItem.contents.author) {
    if (typeof(req.body) !== 'string') {
      res.status(400).end();
      return;
    }

    feedItem.contents.contents = req.body;
    writeDocument('feedItems', feedItem);
    res.send(getFeedItemSync(feedItemId));
  } else {
    res.status(401).end();
  }
});

app.delete('/feeditem/:feeditemid', function(req, res) {
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var feedItemId = parseInt(req.params.feeditemid, 10);
  var feedItem = readDocument('feedItems', feedItemId);

  if (feedItem.contents.author === fromUser) {
    database.deleteDocument('feedItems', feedItemId);
    var feeds = database.getCollection('feeds');
    var feedIds = Object.keys(feeds);
    feedIds.forEach((feedId) => {
      var feed = feeds[feedId];
      var itemIdx = feed.contents.indexOf(feedItemId);
      if (itemIdx !== -1) {
        feed.contents.splice(itemIdx, 1);
        database.writeDocument('feeds', feed);
      }
    });
    res.send();
  } else {
    res.status(401).end();
  }
});

app.put('/feeditem/:feeditemid/likelist/:userid', function(req, res) {
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var feedItemId = parseInt(req.params.feeditemid, 10);
  var userId = parseInt(req.params.userid, 10);

  if (fromUser === userId) {
    var feedItem = readDocument('feedItems', feedItemId);

    if (feedItem.likeCounter.indexOf(userId) === -1) {
      feedItem.likeCounter.push(userId);
      writeDocument('feedItems', feedItem);
    }
    res.send(feedItem.likeCounter.map((userId) =>
    readDocument('users', userId)));
  } else {
    res.status(401).end();
  }
});

app.delete('/feeditem/:feeditemid/likelist/:userid', function(req, res) {
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var feedItemId = parseInt(req.params.feeditemid, 10);
  var userId = parseInt(req.params.userid, 10);

  if (fromUser === userId) {
    var feedItem = readDocument('feedItems', feedItemId);
    var likeIndex = feedItem.likeCounter.indexOf(userId);

    if (likeIndex !== -1) {
      feedItem.likeCounter.splice(likeIndex, 1);
      writeDocument('feedItems', feedItem);
    }

    res.send(feedItem.likeCounter.map((userId) =>
    readDocument('users', userId)));
  } else {
    res.status(401).end();
  }
});

app.post('/search', function(req, res) {
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var user = readDocument('users', fromUser);

  if (typeof(req.body) === 'string') {
    var queryText = req.body.trim().toLowerCase();
    var feedItemIDs = readDocument('feeds', user.feed).contents;

    res.send(feedItemIDs.filter((feedItemID) => {
      var feedItem = readDocument('feedItems', feedItemID);
      return feedItem.contents.contents
      .toLowerCase()
      .indexOf(queryText) !== -1;
    }).map(getFeedItemSync));
  } else {
    res.status(400).end();
  }
});

function postComment(feedItemId, author, contents) {
  var feedItem = readDocument('feedItems', feedItemId);
  feedItem.comments.push({
    "author": author,
    "contents": contents,
    "postDate": new Date().getTime(),
    "likeCounter": []
  });
  writeDocument('feedItems', feedItem);

  return getFeedItemSync(feedItemId);
}

app.post('/feeditem/:feeditemid/commentThread/comment',validate({ body: commentSchema}),function(req,res){
  var body = req.body;
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var feedItemId = req.params.feeditemid;

  if (fromUser === body.author) {
    var newPost = postComment(feedItemId, body.author, body.contents);
    res.status(201);
    res.set('Location', '/feeditem/' + newPost._id);
    res.send(newPost);
  } else {
    res.send(401).end();
  }
});

app.put('/feeditem/:feeditemid/commentThread/comment/:commentId/likelist/:userId',function(req,res){
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var feedItemId = parseInt(req.params.feeditemid,10);
  var commentId = parseInt(req.params.commentId,10);
  var userId = parseInt(req.params.userId,10);

  if(fromUser === userId){
    var feedItem = readDocument('feedItems', feedItemId);
    var comment = feedItem.comments[commentId];

    if(comment.likeCounter.indexOf(userId)===-1){
      comment.likeCounter.push(userId);
    }
    writeDocument('feedItems', feedItem);
    comment.author = readDocument('users', comment.author);
    res.status(201);
    res.send(comment);
  } else {
    res.send(401).end();
  }
});

app.delete('/feeditem/:feeditemid/commentThread/comment/:commentId/likelist/:userId',function(req,res){
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var feedItemId = parseInt(req.params.feeditemid,10);
  var commentId = parseInt(req.params.commentId,10);
  var userId = parseInt(req.params.userId,10);

  if(fromUser === userId){
    var feedItem = readDocument('feedItems', feedItemId);
    var comment = feedItem.comments[commentId];
    var index = comment.likeCounter.indexOf(userId);

    if(index!==-1){
      comment.likeCounter.splice(index,1);
    }
    writeDocument('feedItems', feedItem);
    comment.author = readDocument('users', comment.author);
    res.status(201);
    res.send(comment);
  } else {
    res.send(401).end();
  }
});

app.use(function(err, req, res, next) {
  if (err.name === 'JsonSchemaValidation') {
    res.status(400).end();
  } else {
    next(err);
  }
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
