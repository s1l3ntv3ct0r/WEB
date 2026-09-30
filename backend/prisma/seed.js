import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const db = new PrismaClient();
export async function seed() {
  const passwordHash = await bcrypt.hash('Password123!', 12);
  const users = [];
  for (const username of ['admin','user1','user2','user3','user4','user5']) {
    users.push(await db.user.upsert({ where: { email: `${username}@shoplab.local` }, update: {}, create: { email: `${username}@shoplab.local`, username, passwordHash, role: username === 'admin' ? 'ADMIN' : 'USER', active: username !== 'user5', firstName: username === 'admin' ? 'ShopLab' : 'Demo', lastName: username === 'admin' ? 'Team' : username, cart: { create: {} } } }));
  }
  const names = [
    ['Quiet Hours Headphones','Audio',1290000],['Field Notes Monitor','Workspace',3490000],['Everyday Canvas Tote','Everyday',290000],['Daybreak Water Bottle','Lifestyle',350000],
    ['Studio Wireless Speaker','Audio',890000],['Focus Desk Light','Workspace',650000],['Weekender Carryall','Everyday',790000],['Slow Morning Flask','Lifestyle',420000],
    ['Pocket Sound Earbuds','Audio',990000],['Workday Keyboard','Workspace',1150000],['Daily Organizer','Everyday',240000],['Trail Travel Bottle','Lifestyle',390000],
    ['Analog Listening Set','Audio',1590000],['Minimal Laptop Stand','Workspace',490000],['Transit Crossbody','Everyday',590000],['Still Ceramic Cup','Lifestyle',180000],
    ['Sunday Mini Speaker','Audio',690000],['Canvas Desk Mat','Workspace',320000],['Market Shopping Bag','Everyday',190000],['Essential Thermos','Lifestyle',450000],
  ];
  const products = [];
  for (let i = 0; i < names.length; i++) {
    const [name, category, price] = names[i];
    let product = await db.product.findFirst({ where: { name } });
    if (!product) product = await db.product.create({ data: { name, category, price: String(price), stock: i === 19 ? 0 : 25 + i, description: `Meet the ${name.toLowerCase()}. A thoughtfully chosen essential that brings a little ease to your everyday. Clean lines, a considered finish, and a simple purpose: to make the things you do each day feel a little better.` } });
    products.push(product);
  }
  for (let i = 0; i < 15; i++) await db.review.upsert({ where: { userId_productId: { userId: users[1 + i % 4].id, productId: products[i].id } }, update: {}, create: { userId: users[1 + i % 4].id, productId: products[i].id, rating: 4 + i % 2, content: ['A lovely addition to my everyday setup. Simple and well considered.', 'Exactly what I was looking for. The little details make a difference.', 'Really happy with this. It fits beautifully into my routine.'][i % 3] } });
  for (const [code, percent, active, expires] of [['WELCOME10',10,true,365],['STUDIO15',15,true,365],['WEEKEND20',20,true,365],['EXPIRED10',10,true,-1],['PAUSED25',25,false,365]]) {
    await db.coupon.upsert({ where: { code }, update: {}, create: { code, percent, maxUses: 100, perUserLimit: 1, active, expiresAt: new Date(Date.now() + expires * 86400000) } });
  }
  if (await db.order.count() === 0) {
    for (let i = 0; i < 10; i++) {
      const p = products[i];
      await db.order.create({ data: { userId: users[1 + i % 4].id, subtotal: p.price, total: p.price, discount: '0', shippingAddress: '123 Demo Street, Hanoi, Vietnam', status: ['PENDING','CONFIRMED','SHIPPED','COMPLETED','CANCELLED'][i % 5], items: { create: { productId: p.id, name: p.name, unitPrice: p.price, quantity: 1 } } } });
    }
  }
  if (await db.supportTicket.count() === 0) for (let i = 0; i < 5; i++) await db.supportTicket.create({ data: { userId: users[1 + i % 4].id, title: ['A question about my delivery','Product care advice','Changing my delivery address','Thanks for your help','A question about the collection'][i], status: i === 3 ? 'CLOSED' : 'OPEN', messages: { create: { authorId: users[1 + i % 4].id, message: 'Hello ShopLab team. Could you help me with this demo request? Thank you!' } } } });
  console.log('Seed ready: 6 local accounts, 20 products, 15 reviews, 5 coupons, 10 orders, 5 tickets.');
}
try { await seed(); } finally { await db.$disconnect(); }
