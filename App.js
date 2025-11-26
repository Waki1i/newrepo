import React, { useEffect, useMemo, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import Spinner from 'react-bootstrap/Spinner';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import './App.css';

const API_ENDPOINT = 'https://dummyjson.com/products?limit=100'; // change to your API

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function augmentProduct(p) {
  // Simulated values (replace when using a real API)
  const currentInventory = randomInt(0, 500);
  const avgSalesPerWeek = Number((Math.random() * 40).toFixed(1));
  const daysToReplenish = randomInt(1, 30);
  return {
    id: p.id,
    name: p.title,
    sku: p.id,
    currentInventory,
    avgSalesPerWeek,
    daysToReplenish,
  };
}
async function computeReorderInfo(product) {
  if (!window.__tfModel) {
    const trainingData = tf.tensor2d([
      [20, 50, 3],
      [5, 30, 5],
      [15, 40, 4],
      [8, 60, 2],
    ]);
    const outputData = tf.tensor2d([[0], [1], [0], [1]]);

    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [3], units: 8, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

    model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });

    await model.fit(trainingData, outputData, { epochs: 200, shuffle: true });
    window.__tfModel = model;
  }

  const model = window.__tfModel;
  const input = tf.tensor2d([[product.currentInventory, product.avgSalesPerWeek, product.daysToReplenish]]);
  const result = model.predict(input);
  const val = (await result.data())[0];
  const needsReorder = val > 0.5;

  return {
    needsReorder,
    suggestedReorderQty: needsReorder ? Math.ceil(product.avgSalesPerWeek * 2) : 0,
    weeksOfStock: product.avgSalesPerWeek > 0 ? Number((product.currentInventory / product.avgSalesPerWeek).toFixed(2)) : Infinity,
  };
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [query, setQuery] = useState('');
  const [onlyReorder, setOnlyReorder] = useState(false);
  const [sortKey, setSortKey] = useState('needsReorder');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    let canceled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(API_ENDPOINT);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const json = await res.json();
        const raw = Array.isArray(json.products) ? json.products : json; // support different shapes
        // Ensure at least 100 products by duplicating if needed
        const items = raw.map(augmentProduct);
        while (items.length < 100) {
          // duplicate with slight id shift
          const clone = { ...items[items.length % raw.length] };
          clone.id = `${clone.id}-dup-${items.length}`;
          items.push(clone);
        }

        const enriched = items.map((p) => ({ ...p, reorder: computeReorderInfo(p) }));
        if (!canceled) {
          setProducts(enriched);
          setError(null);
        }
      } catch (err) {
        if (!canceled) setError(err.message);
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    load();
    return () => (canceled = true);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = products;
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || String(p.sku).includes(q));
    if (onlyReorder) list = list.filter((p) => p.reorder.needsReorder);

    list = [...list].sort((a, b) => {
      const aVal = sortValue(a, sortKey);
      const bVal = sortValue(b, sortKey);
      if (aVal === bVal) return 0;
      return sortAsc ? (aVal > bVal ? 1 : -1) : aVal > bVal ? -1 : 1;
    });

    return list;
  }, [products, query, onlyReorder, sortKey, sortAsc]);

  function sortValue(item, key) {
    switch (key) {
      case 'name':
        return item.name.toLowerCase();
      case 'currentInventory':
        return item.currentInventory;
      case 'avgSalesPerWeek':
        return item.avgSalesPerWeek;
      case 'daysToReplenish':
        return item.daysToReplenish;
      case 'weeksOfStock':
        return item.reorder.weeksOfStock === Infinity ? 9999 : item.reorder.weeksOfStock;
      case 'needsReorder':
      default:
        return item.reorder.needsReorder ? 1 : 0;
    }
  }

  // Dashboard summaries
  const totalProducts = products.length;
  const reorderCount = products.filter((p) => p.reorder.needsReorder).length;
  const avgInventory = products.length ? (products.reduce((s, p) => s + p.currentInventory, 0) / products.length).toFixed(1) : 0;

  return (
    <div className="header-dashboard">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <h1 className="display-4">Reorder Dashboard</h1>
        </header>

        <Row className='px-6'>
          <Col className="d-flex flex-column justify-content-center align-items-center py-6 rounded text-white dashboard-data" >
            <h3 className="display-6">Total products</h3>
            <div className="text-2xl font-semibold">{loading ? 
            <span className='d-flex justify-content-start align-items-center '>
              Loading 
              <Spinner animation="border" variant="primary" className="mx-3" />
            </span> 
            : totalProducts}</div>
          </Col>

          <Col className="d-flex flex-column justify-content-center align-items-center py-6 rounded text-white dashboard-data">
            <h3 className="display-6">Products to reorder</h3>
            <div className="text-2xl font-semibold text-red-600">{loading ? 
            <span className='d-flex justify-content-start align-items-center'>
              Loading 
              <Spinner animation="border" variant="primary" className="mx-3" />
            </span> 
            : reorderCount}</div>
          </Col>

          <Col className="d-flex flex-column justify-content-center align-items-center py-6 rounded text-white dashboard-data">
            <h3 className="display-6">Average inventory</h3>
            <div className="text-2xl font-semibold">{loading ?
            <span className='d-flex justify-content-start align-items-center'>
              Loading 
              <Spinner animation="border" variant="primary" className="mx-3" />
            </span> 
            : 
            avgInventory}</div>
          </Col>
        </Row>

        <section className="bg-white p-4 rounded shadow mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                placeholder="Search by name or SKU"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="border rounded p-2"
              />

              
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Sort by</label>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="border rounded p-2">
                <option value="needsReorder">Needs Reorder</option>
                <option value="name">Name</option>
                <option value="currentInventory">Inventory</option>
                <option value="avgSalesPerWeek">Avg Sales / week</option>
                <option value="daysToReplenish">Days to replenish</option>
                <option value="weeksOfStock">Weeks of stock</option>
              </select>
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className="px-3 py-2 border rounded"
                title="Toggle sort direction"
              >
                {sortAsc ? '▲' : '▼'}
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            {loading ? (
              <div className="d-flex justify-content-start align-items-center">
                Loading 
                <Spinner animation="border" variant="primary" className="mx-2" />
              </div>
            ) : error ? (
              <div className="p-6 text-center text-red-600">Error: {error}</div>
            ) : (
              <table className="w-full text-sm table-auto border-collapse">
                <thead>
                  <tr className="text-left">
                    <th className="border-b p-2">ID</th>
                    <th className="border-b p-2">Product</th>
                    <th className="border-b p-2">Inventory</th>
                    <th className="border-b p-2">Avg / wk</th>
                    <th className="border-b p-2">Days to replenish</th>
                    <th className="border-b p-2">Weeks of stock</th>
                    <th className="border-b p-2">Reorder?</th>
                    <th className="border-b p-2">Suggested qty</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="odd:bg-gray-50">
                      <td className="p-2 align-top">{p.sku}</td>
                      <td className="p-2 align-top max-w-xs">
                        <div className="font-medium">{p.name}</div>
                      </td>
                      <td className="p-2 align-top">{p.currentInventory}</td>
                      <td className="p-2 align-top">{p.avgSalesPerWeek}</td>
                      <td className="p-2 align-top">{p.daysToReplenish}</td>
                      <td className="p-2 align-top">{p.reorder.weeksOfStock === Infinity ? '—' : p.reorder.weeksOfStock}</td>
                      <td className="p-2 align-top">
                        {p.reorder.needsReorder ? (
                          <span className="inline-block px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Reorder</span>
                        ) : (
                          <span className="inline-block px-2 py-1 rounded bg-green-100 text-green-700 text-xs">OK</span>
                        )}
                      </td>
                      <td className="p-2 align-top">{p.reorder.suggestedReorderQty > 0 ? p.reorder.suggestedReorderQty : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
