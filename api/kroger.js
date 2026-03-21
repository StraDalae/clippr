// api/kroger.js
// Handles Kroger OAuth token, location lookup, and product search

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${process.env.KROGER_CLIENT_ID}:${process.env.KROGER_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: 'grant_type=client_credentials&scope=product.compact'
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kroger auth failed: ${err}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

async function getNearestStoreId(token, lat, lon) {
  const params = new URLSearchParams({
    'filter.latLong.near': `${lat},${lon}`,
    'filter.limit': '1',
    'filter.radiusInMiles': '25',
  });

  const res = await fetch(
    `https://api.kroger.com/v1/locations?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kroger locations failed: ${err}`);
  }

  const data = await res.json();
  const store = data.data?.[0];
  if (!store) return null;

  return {
    locationId: store.locationId,
    name: store.name,
    address: store.address?.addressLine1 || '',
    city: store.address?.city || '',
    distance: store.geolocation?.distance ?? null,
  };
}

async function searchProducts(token, term, locationId) {
  const params = new URLSearchParams({
    'filter.term': term,
    'filter.limit': '8',
    'filter.fulfillment': 'ais',
  });

  if (locationId) {
    params.append('filter.locationId', locationId);
  }

  const res = await fetch(
    `https://api.kroger.com/v1/products?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kroger products failed: ${err}`);
  }

  const data = await res.json();

  return (data.data || []).map(product => {
    const item = product.items?.[0];
    const price = item?.price;
    return {
      productId: product.productId,
      name: product.description,
      brand: product.brand || '',
      size: item?.size || '',
      regularPrice: price?.regular ?? null,
      salePrice: price?.promo ?? null,
      onSale: price?.promo != null && price.promo < (price.regular ?? Infinity),
      imageUrl: product.images
        ?.find(i => i.perspective === 'front')
        ?.sizes?.find(s => s.size === 'medium')?.url || null,
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { term, lat, lon } = req.body;

  if (!term) {
    return res.status(400).json({ error: 'Missing search term' });
  }

  try {
    const token = await getAccessToken();

    // Find nearest Kroger if coordinates provided
    let storeInfo = null;
    if (lat != null && lon != null) {
      storeInfo = await getNearestStoreId(token, lat, lon);
    }

    // Search products scoped to that store
    const products = await searchProducts(token, term, storeInfo?.locationId ?? null);

    return res.status(200).json({ products, store: storeInfo });

  } catch (err) {
    console.error('Kroger API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}