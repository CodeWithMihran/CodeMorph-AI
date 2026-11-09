import React from "react";
import { Link } from "react-router-dom";

export default function Catalog() {
  return (
    <section>
      <h2>Product Catalog Grid</h2>
      <Link to="/cart">View Cart</Link>
    </section>
  );
}
