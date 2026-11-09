import React from "react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <section>
      <h1>Modern E-Commerce Storefront</h1>
      <Link to="/catalog">Browse Catalog</Link>
    </section>
  );
}
