import React from "react";
import { Link } from "react-router-dom";

export default function Cart() {
  return (
    <section>
      <h2>Shopping Cart Summary</h2>
      <Link to="/checkout">Proceed to Checkout</Link>
    </section>
  );
}
