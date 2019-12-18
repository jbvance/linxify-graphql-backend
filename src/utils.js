const metascraper = require('metascraper')([
    require('metascraper-title')(),
    require('metascraper-logo')(),
  require('metascraper-clearbit')(),
]);
const got = require('got');
const Url = require('url-parse');

function hasPermission(user, permissionsNeeded) {
  const matchedPermissions = user.permissions.filter(permissionTheyHave =>
    permissionsNeeded.includes(permissionTheyHave)
  );
  if (!matchedPermissions.length) {
    throw new Error(`You do not have sufficient permissions

      : ${permissionsNeeded}

      You Have:

      ${user.permissions}
      `);
  }
}

async function getMeta(targetUrl) {
    try {
        const {
            body: html,
            url
        } = await got(targetUrl);
        const metadata = await metascraper({
            html,
            url
        })
        return Promise.resolve(metadata);
    } catch (err) {
        console.error(`ERROR GETTING METADATA FROM ${targetUrl}`, err);
        //Don't throw an error. The info may not be able to be scraped, so
        // just return null if it doesn't work
        return Promise.resolve(null);
    }
}

//Effectively limits the amount of time a promise is allowed to run
// before rejecting. This is used for potentially long async calls
// to prevent them from running too long. If getTitle or getLogo
// take too long, we will resolve to a default of an empty string ('')
promiseTimeout = function(ms, promise){

    // Create a promise that rejects in <ms> milliseconds
    let timeout = new Promise((resolve, reject) => {
      let id = setTimeout(() => {
        clearTimeout(id);        
        resolve('');
      }, ms)
    })
  
    // Returns a race between our timeout and the passed in promise
    return Promise.race([
      promise,
      timeout
    ])
  }

module.exports = {
    hasPermission,
    getMeta,
    promiseTimeout
};

