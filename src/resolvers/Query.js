const { forwardTo } = require('prisma-binding');
const { hasPermission } = require('../utils');

const Query = {
  //items: forwardTo('db'),
  // same as above - you can do when the Yoga Query and Prisma Query are the same
  // and you don't care about running any custom logic
  //    async items(parent, args, ctx, info) {
  //        const items = await ctx.db.query.items();
  //        return items;
  //    }
  //item: forwardTo('db'),

  linksConnection(parent, args, ctx, info) {
    const where = {
      user: {
        id: ctx.request.userId
      }
    }
    return ctx.db.query.linksConnection({ where }, info);
  },

  categories: forwardTo('db'),

  me(parent, args, ctx, info) {

    if (!ctx.request.userId) {
      return null;
    }    
    return ctx.db.query.user(
      {
        where: {
          id: ctx.request.userId
        }
      },
      info
    );
  },

  async users(parent, args, ctx, info) {
    if (!ctx.request.userId) throw new Error('You must be logged in');
    //hasPermission(ctx.request.user, ['ADMIN', 'PERMISSIONUPDATE']);
    return ctx.db.query.users({}, info);
  },

  async userCategories(parent, args, ctx, info) {   
    if (!ctx.request.userId) throw new Error('You must be logged in');
    const where = {
      user: {
        id: ctx.request.userId
      }
    };
    return ctx.db.query.categories({ where }, info);
  },

  async userCategory(parent, args, ctx, info) {
    if (!ctx.request.userId) throw new Error('You must be logged in');
      const where = {
      id: args.id
    }
    return ctx.db.query.category({ where }, info);
  },


  async userLink(parent, args, ctx, info) {
    if (!ctx.request.userId) throw new Error('You must be logged in');
    const where = {
      AND: [
        { id: args.id },
        {
          user: {
            id: ctx.request.userId
          }
        }
      ]
    };
    const links = await ctx.db.query.links({ where }, info);
    if (!links || links.length < 1) {
      throw new Error('Unable to locate link');
    }
    return links[0];
  },

  async userLinks(parent, args, ctx, info) {       
    if (!ctx.request.userId) throw new Error('You must be logged in');
    const where = {
      user: {
        id: ctx.request.userId
      }
    };
    return ctx.db.query.links({ where, first: args.first, skip: args.skip, orderBy: 'createdAt_DESC' }, info);
  },
  
  async searchUserLinks(parent, args, ctx, info) {
     if (!ctx.request.userId) throw new Error('You must be logged in');
     const searchString = args.searchString;
     const where = {
     OR:[
      	{title_contains: searchString},
        {url_contains: searchString},
        {note_contains: searchString},
        { category:{
          name_contains: searchString
        }}
    ],
     AND:[
        {user: {
          id: ctx.request.userId
        }}      
      ]
    };
    return ctx.db.query.links({ where }, info);
  },

  async userCategoryLinks(parent, args, ctx, info) {    
    if (!ctx.request.userId) throw new Error('You must be logged in');
    const where = {
      AND: [
        {user: {
          id: ctx.request.userId
        }},
        {category: {
          id: args.categoryId
        }}
      ]
    };
    return ctx.db.query.links({ where }, info);
  }

};

module.exports = Query;
