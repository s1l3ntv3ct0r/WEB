import { test, expect } from '@playwright/test';
async function login(page, email) {
  await page.goto('/login'); await page.getByLabel('Email address').fill(email); await page.getByLabel('Password', { exact: true }).fill('Password123!'); await page.getByRole('button', { name: 'Sign in →', exact: true }).click(); await expect(page).toHaveURL(/\/products$/);
}
test('catalogue works on desktop and mobile without overflow', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  await expect(page.getByRole('heading', { name: /Good things/ })).toBeVisible(); await expect(page.locator('.product-card')).toHaveCount(8);
  await page.screenshot({ path: 'test-results/shoplab-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Audio', exact: true }).click(); await expect(page.locator('.product-card')).toHaveCount(5);
  await page.getByLabel('Search products').fill('no-such-item-please'); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nothing here just yet.' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await expect(page.locator('.product-card')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/shoplab-mobile.png', fullPage: true }); expect(errors).toEqual([]);
});
test('user can register, checkout, cancel and open a ticket', async ({ page }) => {
  const unique=Date.now(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/register'); await page.getByLabel('Username').fill(`ui_${unique}`); await page.getByLabel('Email address').fill(`ui_${unique}@shoplab.local`); await page.getByLabel('Password',{exact:true}).fill('Password123!'); await page.getByRole('button',{name:'Create account →'}).click();
  await expect(page).toHaveURL(/\/products$/); await page.reload(); await expect(page.locator('.account-link')).toContainText(`ui_${unique}`);
  await page.locator('.product-image-link').first().click(); await page.getByRole('button',{name:'Add to bag ↗'}).click(); await expect(page.getByRole('status')).toContainText('Added to your bag.');
  await page.getByRole('link',{name:'View your bag →'}).click(); await page.getByLabel('Coupon code').fill('WELCOME10'); await page.getByRole('button',{name:'Apply',exact:true}).click(); await expect(page.locator('.summary')).toContainText('WELCOME10');
  await page.getByLabel('Delivery address').fill('123 UI Test Street, Hanoi, Vietnam'); await page.getByRole('button',{name:'Place order →'}).click(); await expect(page).toHaveURL(/\/orders\/\d+$/); await expect(page.locator('.status')).toHaveText('PENDING');
  await page.getByRole('button',{name:'Cancel this order'}).click(); await expect(page.locator('.status')).toHaveText('CANCELLED');
  await page.getByRole('link',{name:'Support',exact:true}).click(); await page.getByLabel('What is it about?').fill(`UI ticket ${unique}`); await page.getByLabel('Your message').fill('Please help with this local demo order.'); await page.getByRole('button',{name:'Send message →'}).click(); await expect(page).toHaveURL(/\/support\/\d+$/);
  await page.getByLabel('Your reply').fill('A follow-up from the customer.'); await page.getByRole('button',{name:'Send reply →'}).click(); await expect(page.locator('.message')).toHaveCount(2);
  await page.getByRole('button',{name:'Everything sorted? Close conversation'}).click(); await expect(page.locator('.status')).toHaveText('CLOSED');
  await page.getByRole('button',{name:'Sign out',exact:true}).click(); await expect(page).toHaveURL(/\/login$/); expect(errors).toEqual([]);
});
test('admin can manage product, coupon and inspect support', async ({ page }) => {
  await login(page,'admin@shoplab.local'); await page.getByRole('link',{name:'Admin',exact:true}).click(); await expect(page.getByRole('heading',{name:'Store overview.'})).toBeVisible();
  await page.getByRole('navigation',{name:'Administration'}).getByRole('link',{name:'products',exact:true}).click();
  await page.getByRole('button',{name:'+ Add product'}).click(); await page.getByLabel('Name',{exact:true}).fill(`UI item ${Date.now()}`); await page.getByLabel('Description').fill('A product created by the browser smoke test.'); await page.getByLabel('Price (VND)').fill('250000'); await page.getByLabel('Stock',{exact:true}).fill('5'); await page.getByRole('button',{name:'Save changes'}).click(); await expect(page.getByRole('status')).toContainText('Changes saved.');
  await page.getByRole('navigation',{name:'Administration'}).getByRole('link',{name:'coupons',exact:true}).click(); await page.getByRole('button',{name:'+ Add coupon'}).click(); await page.getByLabel('Code',{exact:true}).fill(`UI${Date.now()}`); await page.getByLabel('Expires on').fill('2028-12-31'); await page.getByRole('button',{name:'Save changes'}).click(); await expect(page.getByRole('status')).toContainText('Changes saved.');
  await page.getByRole('navigation',{name:'Administration'}).getByRole('link',{name:'tickets',exact:true}).click(); await expect(page.getByRole('heading',{name:'Support inbox.'})).toBeVisible(); await page.locator('.list-card').first().click(); await expect(page.locator('.message').first()).toBeVisible();
});
test('avatar upload and emailed password reset work end to end', async ({ page, request }) => {
  const unique=Date.now(); const email=`reset_${unique}@shoplab.local`;
  await page.goto('/register'); await page.getByLabel('Username').fill(`reset_${unique}`); await page.getByLabel('Email address').fill(email); await page.getByLabel('Password',{exact:true}).fill('Password123!'); await page.getByRole('button',{name:'Create account →'}).click(); await expect(page).toHaveURL(/\/products$/);
  await page.goto('/profile');
  await page.getByLabel('Profile image · PNG or JPEG, up to 2 MB').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWOonVJDEmIY1TBlNJRqh2vSAAAPsI0QBMelfQAAAABJRU5ErkJggg==','base64')});
  await page.getByRole('button',{name:'Update photo'}).click(); await expect(page.getByRole('status')).toContainText('Your photo has been updated.'); await expect(page.getByAltText('Your avatar')).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click(); await page.goto('/forgot-password'); await page.getByLabel('Email address').fill(email); await page.getByRole('button',{name:'Send reset link →'}).click(); await expect(page.getByRole('status')).toContainText('If this account exists');
  const inbox=await request.get('http://localhost:8025'); const html=await inbox.text(); expect(html).toContain(email);
  const url=html.match(/http:\/\/localhost:5173\/reset-password\?token=[A-Za-z0-9_-]+/)?.[0]; expect(url).toBeTruthy();
  await page.goto(url); await page.getByLabel('New password (12+ characters)').fill('UpdatedPassword123!'); await page.getByRole('button',{name:'Update password →'}).click(); await expect(page.getByRole('status')).toContainText('Password updated.');
  await page.goto('/login'); await page.getByLabel('Email address').fill(email); await page.getByLabel('Password',{exact:true}).fill('UpdatedPassword123!'); await page.getByRole('button',{name:'Sign in →',exact:true}).click(); await expect(page).toHaveURL(/\/products$/);
  await page.goto(url); await page.getByLabel('New password (12+ characters)').fill('AnotherPassword123!'); await page.getByRole('button',{name:'Update password →'}).click(); await expect(page.getByRole('alert')).toContainText('Reset link is invalid or expired.');
});
