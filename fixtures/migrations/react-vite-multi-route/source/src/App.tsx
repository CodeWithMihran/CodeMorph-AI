import { Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";

export default function App() {
  return <><nav><Link to="/">Home</Link><Link to="/about">About</Link></nav><Routes><Route path="/" element={<Home />} /><Route path="/about" element={<About />} /></Routes></>;
}
