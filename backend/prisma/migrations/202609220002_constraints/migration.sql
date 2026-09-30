ALTER TABLE "Product" ADD CONSTRAINT "product_price_positive" CHECK ("price" > 0), ADD CONSTRAINT "product_stock_nonnegative" CHECK ("stock" >= 0);
ALTER TABLE "Review" ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "CartItem" ADD CONSTRAINT "cart_quantity_range" CHECK ("quantity" BETWEEN 1 AND 99);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_quantity_range" CHECK ("quantity" BETWEEN 1 AND 99), ADD CONSTRAINT "order_item_price_positive" CHECK ("unitPrice" > 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "coupon_percent_range" CHECK ("percent" BETWEEN 1 AND 100), ADD CONSTRAINT "coupon_limits_positive" CHECK ("maxUses" > 0 AND "perUserLimit" > 0);
ALTER TABLE "Order" ADD CONSTRAINT "order_totals_consistent" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "total" >= 0 AND "subtotal" - "discount" = "total");
