import {readDocument, writeDocument, addDocument, deleteDocument, getCollection} from './database.js';

var token = 'eyJpZCI6NH0=';

function sendXHR(verb, resource, body, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open(verb, resource);
  xhr.setRequestHeader('Authorization', 'Bearer ' + token);

  xhr.addEventListener('load', function() {
    var statusCode = xhr.status;
    var statusText = xhr.statusText;
    if (statusCode >= 200 && statusCode < 300) {
      cb(xhr);
    } else {
      var responseText = xhr.responseText;

      FacebookError('Could not ' + verb + " " + resource + ": Received " +
      statusCode + " " + statusText + ": " + responseText);
    }
  });

  xhr.timeout = 10000;
  xhr.addEventListener('error', function() {
    FacebookError('Could not ' + verb + " " + resource +
    ": Could not connect to the server.");
  });

  xhr.addEventListener('timeout', function() {
    FacebookError('Could not ' + verb + " " + resource +
    ": Request timed out.");
  });

  switch (typeof(body)) {
    case 'undefined':
    xhr.send();
    break;
    case 'string':
    xhr.setRequestHeader("Content-Type", "text/plain;charset=UTF-8");
    xhr.send(body);
    break;
    case 'object':
    xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    xhr.send(JSON.stringify(body));
    break;
    default:
    throw new Error('Unknown body type: ' + typeof(body));
  }
}

/**
 * Emulates how a REST call is *asynchronous* -- it calls your function back
 * some time in the future with data.
 */
function emulateServerReturn(data, cb) {
  setTimeout(() => {
    cb(data);
  }, 4);
}

/**
 * Resolves a feed item. Internal to the server, since it's synchronous.
 */
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

export function getFeedData(user, cb) {
  sendXHR('GET', '/user/4/feed', undefined, (xhr) => {

    cb(JSON.parse(xhr.responseText));
  });
}

/**
 * Adds a new status update to the database.
 */
export function postStatusUpdate(user, location, contents, cb) {
  sendXHR('POST', '/feeditem', {
    userId: user,
    location: location,
    contents: contents
  }, (xhr) => {

    cb(JSON.parse(xhr.responseText));
  });
}

/**
 * Adds a new comment to the database on the given feed item.
 */
export function postComment(feedItemId, author, contents, cb) {
  var feedItem = readDocument('feedItems', feedItemId);
  feedItem.comments.push({
    "author": author,
    "contents": contents,
    "postDate": new Date().getTime(),
    "likeCounter": []
  });
  writeDocument('feedItems', feedItem);
  // Return a resolved version of the feed item.
  emulateServerReturn(getFeedItemSync(feedItemId), cb);
}

/**
 * Updates a feed item's likeCounter by adding the user to the likeCounter.
 * Provides an updated likeCounter in the response.
 */
export function likeFeedItem(feedItemId, userId, cb) {
  var feedItem = readDocument('feedItems', feedItemId);
  // Normally, we would check if the user already liked this comment.
  // But we will not do that in this mock server.
  // ('push' modifies the array by adding userId to the end)
  feedItem.likeCounter.push(userId);
  writeDocument('feedItems', feedItem);
  // Return a resolved version of the likeCounter
  emulateServerReturn(feedItem.likeCounter.map((userId) => readDocument('users', userId)), cb);
}

/**
 * Updates a feed item's likeCounter by removing the user from the likeCounter.
 * Provides an updated likeCounter in the response.
 */
export function unlikeFeedItem(feedItemId, userId, cb) {
  var feedItem = readDocument('feedItems', feedItemId);
  // Find the array index that contains the user's ID.
  // (We didn't *resolve* the FeedItem object, so it is just an array of user IDs)
  var userIndex = feedItem.likeCounter.indexOf(userId);
  // -1 means the user is *not* in the likeCounter, so we can simply avoid updating
  // anything if that is the case: the user already doesn't like the item.
  if (userIndex !== -1) {
    // 'splice' removes items from an array. This removes 1 element starting from userIndex.
    feedItem.likeCounter.splice(userIndex, 1);
    writeDocument('feedItems', feedItem);
  }
  // Return a resolved version of the likeCounter
  emulateServerReturn(feedItem.likeCounter.map((userId) => readDocument('users', userId)), cb);
}

/**
 * Adds a 'like' to a comment.
 */
export function likeComment(feedItemId, commentIdx, userId, cb) {
  var feedItem = readDocument('feedItems', feedItemId);
  var comment = feedItem.comments[commentIdx];
  comment.likeCounter.push(userId);
  writeDocument('feedItems', feedItem);
  comment.author = readDocument('users', comment.author);
  emulateServerReturn(comment, cb);
}

/**
 * Removes a 'like' from a comment.
 */
export function unlikeComment(feedItemId, commentIdx, userId, cb) {
  var feedItem = readDocument('feedItems', feedItemId);
  var comment = feedItem.comments[commentIdx];
  var userIndex = comment.likeCounter.indexOf(userId);
  if (userIndex !== -1) {
    comment.likeCounter.splice(userIndex, 1);
    writeDocument('feedItems', feedItem);
  }
  comment.author = readDocument('users', comment.author);
  emulateServerReturn(comment, cb);
}

/**
 * Updates the text in a feed item (assumes a status update)
 */
export function updateFeedItemText(feedItemId, newContent, cb) {
  var feedItem = readDocument('feedItems', feedItemId);
  // Update text content of update.
  feedItem.contents.contents = newContent;
  writeDocument('feedItems', feedItem);
  emulateServerReturn(getFeedItemSync(feedItemId), cb);
}

/**
 * Deletes a feed item.
 */
export function deleteFeedItem(feedItemId, cb) {
  // Assumption: The current user authored this feed item.
  deleteDocument('feedItems', feedItemId);
  // Remove references to this feed item from all other feeds.
  var feeds = getCollection('feeds');
  var feedIds = Object.keys(feeds);
  feedIds.forEach((feedId) => {
    var feed = feeds[feedId];
    var itemIdx = feed.contents.indexOf(feedItemId);
    if (itemIdx !== -1) {
      // Splice out of array.
      feed.contents.splice(itemIdx, 1);
      // Update feed.
      writeDocument('feeds', feed);
    }
  });

  // Return nothing. The return just tells the client that
  // the server has acknowledged the request, and that it has
  // been a success.
  emulateServerReturn(null, cb);
}

/**
 * Searches for feed items with the given text.
 */
export function searchForFeedItems(userId, queryText, cb) {
  // trim() removes whitespace before and after the query.
  // toLowerCase() makes the query lowercase.
  queryText = queryText.trim().toLowerCase();
  var feedId = readDocument('users', userId).feed;
  var feedItemIDs = readDocument('feeds', feedId).contents;
  emulateServerReturn(
    // "filter" is like "map" in that it is a magic method for
    // arrays. It takes an anonymous function, which it calls
    // with each item in the array. If that function returns 'true',
    // it will include the item in a return array. Otherwise, it will
    // not.
    // Here, we use filter to return only feedItems that contain the
    // query text.
    // Since the array contains feed item IDs, we later map the filtered
    // IDs to actual feed item objects.
    feedItemIDs.filter((feedItemID) => {
      var feedItem = readDocument('feedItems', feedItemID);
      return feedItem.contents.contents.toLowerCase().indexOf(queryText) !== -1;
    }).map(getFeedItemSync),
    cb
  );
}
