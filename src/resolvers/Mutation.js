const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail } = require('../mail');
const { hasPermission } = require('../utils');
const stripe = require('../stripe');
const {
    getMeta,
    promiseTimeout,
    validateUrl
} = require('../utils');

const Mutations = {
  // async createItem(parent, args, ctx, info) {
  //   if (!ctx.request.userId)
  //     throw new Error('You must be logged in to create an item');
  //   const item = await ctx.db.mutation.createItem(
  //     {
  //       data: {
  //         // Create a relationship between item and user
  //         user: {
  //           connect: {
  //             id: ctx.request.userId
  //           }
  //         },
  //         ...args
  //       }
  //     },
  //     info
  //   );

  //   return item;
  // },
  // updateItem(parent, args, ctx, info) {
  //   // first take a copy of the updated
  //   const updates = { ...args };
  //   // remove ID from updates because you can't update it
  //   delete updates.id;
  //   return ctx.db.mutation.updateItem(
  //     {
  //       data: updates,
  //       where: { id: args.id }
  //     },
  //     info
  //   );
  // },

  // async deleteItem(parent, args, ctx, info) {
  //   const where = { id: args.id };
  //   const item = await ctx.db.query.item({ where }, `{ id title user { id } }`);
  //   const ownsItem = item.user.id === ctx.request.userId;
  //   const hasPermissions = ctx.request.user.permissions.some(permission =>
  //     ['ADMIN', 'ITEMDELETE'].includes(permission)
  //   );
  //   if (!ownsItem && !hasPermissions) {
  //     throw new Error("You don't have permission to delete this item");
  //   }
  //   return ctx.db.mutation.deleteItem({ where }, info);
  // },

  async createLink(parent, args, ctx, info) {
    const requiredFields = ['url'];
    const missingField = requiredFields.find(field => !(field in args));
    const user = ctx.request.user;

    // verify user exists
    if (!user) {
      throw new Error(`ValidationError: User does not exist`);
    }

    if (missingField) {
      throw new Error(`ValidationError: Missing Field ${missingField}`);
    }

    const url = args.url;
    let catToFind = null;

    catToFind = args.category || 'none';

    // Validate url format
    validateUrl(url);

    // create a variable for category and title in case we need to save it into the link below
    let categories, category, categoryId, link, title, favIcon, note;
    note = args.note || null;

    try {
          const metaData = await promiseTimeout(1500, getMeta(url));
          title = metaData.title || url;
          favIcon = metaData.logo || null;
          // If category does not exist, create it here
          if (args.category) {
            categories = await ctx.db.query.categories(
              {
                where: {
                  OR: [{ id: catToFind }, { name_contains: catToFind }],
                  AND: [
                    {
                      user: {
                        id: user.id
                      }
                    }
                  ]
                }
              },
              '{ id }'
            );
            if (categories && categories.length > 0) {
              categoryId = categories[0].id;
            }
          }
          console.log('CATEGORY', categoryId);
          //create new Category if one was passed via args but not found in db
          if (args.category && !categoryId) {
            console.log(`CREATING CATEGORY ${args.category}`);
            category = await ctx.db.mutation.createCategory(
              {
                data: {
                  name: args.category,
                  user: {
                    connect: {
                      id: ctx.request.userId
                    }
                  }
                }
              },
              '{ id }'
            );
            categoryId = category.id;
            console.log('CATEGORY ADDED', categoryId);
          }

          //create data object and remove category if none was passed in
          const data = {
            url,
            favIcon,
            title,
            note,
            category: {
              connect: {
                id: categoryId
              }
            },
            user: {
              connect: {
                id: user.id
              }
            }
          };

          if(!categoryId) {
            delete data.category;
          }

          return await ctx.db.mutation.createLink(
            {
              data
            },
            '{ id url title favIcon }'
          );
        } catch (err) {
      console.error(err);
      throw new Error('ERROR CREATING LINK', err);
    }
  },

  async updateLink(parent, args, ctx, info) {
    const user = ctx.request.user;
    if (!user) throw new Error('You must be logged in');
    // first take a copy of the updated link
    const updates = { ...args };
    // remove ID from updates because you can't update it
    delete updates.id;
    // remove category because it has to be connected manually
    delete updates.category;

    // Validate url format
    validateUrl(args.url);

    try {
      const metaData = await promiseTimeout(1500, getMeta(args.url));
      title = metaData.title || args.url;
      favIcon = metaData.logo || null;

      // TODO: use default logo if none is returned

      return ctx.db.mutation.updateLink(
        {
          data: {
            ...updates,
            title,
            favIcon,
            category: {
              connect: {
                id: args.category
              }
            }
          },
          where: { id: args.id }
        },
        info
      );
    } catch (err) {
      throw new Error(err);
    }
  },

  async deleteLink(parent, { id }, ctx, info) {
    const user = ctx.request.user;
    if (!user) throw new Error('You must be logged in');

    // Verify this link belongs to the user
    const linkToDelete = await ctx.db.query.link(
      {
        where: {
          id
        }
      },
      '{ id user { id } }'
    );

    if (!linkToDelete) throw new Error(`Unable to locate link with ID '${id}'`);
    if (linkToDelete.user.id !== user.id) throw new Error('Error: You can only delete links that you created');   

    return ctx.db.mutation.deleteLink({
      where: {
        id
      }
    });
  },

  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();
    // hash the password
    const password = await bcrypt.hash(args.password, 10);
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ['USER'] }
        }
      },
      info
    );
    //create jwt for user
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    //set jwt as cookie on response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365
    }); // 1 year cookieParser
    //return user to browser
    return user;
  },

  async signin(parent, { email, password }, ctx, info) {
    const user = await ctx.db.query.user({ where: { email } });
    if (!user) {
      throw new Error(`No such user found for email ${email}`);
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new Error('Invalid Password');
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365
    });
    return user;
  },
  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'Goodbye!' };
  },
  async requestReset(parent, { email }, ctx, info) {
    const user = await ctx.db.query.user({ where: { email } });
    if (!user) throw new Error(`No such user found for email ${email}`);
    const randomBytesPromisified = promisify(randomBytes);
    const resetToken = (await randomBytesPromisified(20)).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email },
      data: { resetToken, resetTokenExpiry }
    });
    const mailRes = await transport.sendMail({
      from: 'jbvance@gmail.com',
      to: user.email,
      subject: 'Password Reset',
      html: makeANiceEmail(
        `Your password reset token is here! \n\n <a href="${process.env.FRONTEND_URL}/reset?resetToken=${resetToken}">Click here to reset your password</a>`
      )
    });
    return { message: 'Thanks!' };
  },
  async resetPassword(parent, args, ctx, info) {
    if (args.password !== args.confirmPassword)
      throw new Error('Your passwords do not match');
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000
      }
    });
    if (!user) throw new Error('This token is either invalid or expired');
    const password = await bcrypt.hash(args.password, 10);
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: { password, resetToken: null, resetTokenExpiry: null }
    });
    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET);
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365
    });
    return updatedUser;
  },
  async updatePermissions(parent, args, ctx, info) {
    // check if logged in
    if (!ctx.request.userId) throw new Error('You must be logged in!');
    // query current user
    const currentUser = await ctx.db.query.user(
      { where: { id: ctx.request.userId } },
      info
    );
    // check permission to udpate permissions
    hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE']);
    // update permissions
    return ctx.db.mutation.updateUser(
      {
        data: {
          permissions: {
            set: args.permissions
          }
        },
        where: {
          id: args.userId
        }
      },
      info
    );
  },

  async createCategory(parent, args, ctx, info) {
    const { userId } = ctx.request;
    if (!userId)
      throw new Error('You  must be signed in to complete this order');
    return ctx.db.mutation.createCategory(
      {
        data: {
          name: args.name.toLowerCase(),
          user: {
            connect: {
              id: userId
            }
          }
        }
      },
      info
    );
  },

  async deleteCategory(parent, args, ctx, info) {
    const where = { id: args.id };
    const category = await ctx.db.query.category(
      { where },
      `{ id name user { id } }`
    );
    const ownsItem = category.user.id === ctx.request.userId;
    if (!ownsItem) {
      throw new Error('You can only delete items that belong to you');
    }
    return ctx.db.mutation.deleteCategory({ where }, info);
  }

  // async createOrder(parent, args, ctx, info) {
  //   const { userId } = ctx.request;
  //   if(!userId) throw new Error('You  must be signed in to complete this order');
  //   const user = await ctx.db.query.user({
  //     where: {
  //       id: userId
  //     }
  //   }, `{ id
  //         name
  //         email
  //         cart {
  //             id
  //             quantity
  //             item { title price id description image }
  //         }
  //       }`)

  //   //recalcuate total price (in case user tried to change it on the client)
  //   const amount = user.cart.reduce((tally, cartItem) =>  {
  //     return tally + cartItem.item.price * cartItem.quantity;
  //   }, 0);

  //   //Create the Stripe Charge (turn token into money)
  //   const charge = await stripe.charges.create({
  //     amount,
  //     currency: 'USD',
  //     source: args.token
  //   });

  //   //console.log(`Going to charge for a total of ${amount}`);

  // }
};

module.exports = Mutations;
