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
  sendXHR('POST','/feeditem/'+feedItemId+'/commentThread/comment',{
    author: author,
    contents: contents
  },(xhr)=>{
    cb(JSON.parse(xhr.responseText));
  });
}

/**
 * Updates a feed item's likeCounter by adding the user to the likeCounter.
 * Provides an updated likeCounter in the response.
 */
export function likeFeedItem(feedItemId, userId, cb) {
  sendXHR('PUT', '/feeditem/' + feedItemId + '/likelist/' + userId,
  undefined, (xhr) => {
    cb(JSON.parse(xhr.responseText));
  });
}

/**
 * Updates a feed item's likeCounter by removing the user from the likeCounter.
 * Provides an updated likeCounter in the response.
 */
export function unlikeFeedItem(feedItemId, userId, cb) {
  sendXHR('DELETE', '/feeditem/' + feedItemId + '/likelist/' + userId,
  undefined, (xhr) => {
    cb(JSON.parse(xhr.responseText));
  });
}
/**
 * Adds a 'like' to a comment.
 */
export function likeComment(feedItemId, commentIdx, userId, cb) {
  sendXHR('PUT','/feeditem/'+feedItemId+'/commentThread/comment/'+commentIdx+'/likelist/'+userId,undefined,
  (xhr)=>{
    cb(JSON.parse(xhr.responseText));
  });
}

/**
 * Removes a 'like' from a comment.
 */
export function unlikeComment(feedItemId, commentIdx, userId, cb) {
  sendXHR('DELETE','/feeditem/'+feedItemId+'/commentThread/comment/'+commentIdx+'/likelist/'+userId,undefined,
  (xhr)=>{
    cb(JSON.parse(xhr.responseText));
  });
}

/**
 * Updates the text in a feed item (assumes a status update)
 */
export function updateFeedItemText(feedItemId, newContent, cb) {
  sendXHR('PUT', '/feeditem/' + feedItemId + '/content', newContent, (xhr) => {
    cb(JSON.parse(xhr.responseText));
  });
}

/**
 * Deletes a feed item.
 */
export function deleteFeedItem(feedItemId, cb) {
  sendXHR('DELETE', '/feeditem/' + feedItemId, undefined, () => {
    cb();
  });
}

/**
 * Searches for feed items with the given text.
 */
export function searchForFeedItems(userID, queryText, cb) {
  sendXHR('POST', '/search', queryText, (xhr) => {
    cb(JSON.parse(xhr.responseText));
  });
}
