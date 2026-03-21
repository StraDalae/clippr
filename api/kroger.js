// api/kroger.js
// Handles Kroger OAuth token + product search
// Caches the access token in memory for its lifetime (30 min)

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  // Return cached token if still valid (with 60s buffer)
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { term, locationId } = req.body;

  if (!term) {
    return res.status(400).json({ error: 'Missing search term' });
  }

  try {
    const token = await getAccessToken();

    // Build query — filter by location if provided
    const params = new URLSearchParams({
      'filter.term': term,
      'filter.limit': '10',
    });
    if (locationId) {
      params.append('filter.locationId', locationId);
    }

    const productRes = await fetch(
      `https://api.kroger.com/v1/products?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!productRes.ok) {
      const err = await productRes.text();
      throw new Error(`Kroger products failed: ${err}`);
    }

    const data = await productRes.json();

    // Normalize the response into the shape the app expects
    const products = (data.data || []).map(product => {
      const item = product.items?.[0];
      const price = item?.price;
      return {
        productId: product.productId,
        name: product.description,
        brand: product.brand || '',
        size: item?.size || '',
        regularPrice: price?.regular ?? null,
        salePrice: price?.promo ?? null,
        onSale: price?.promo != null && price.promo < price.regular,
        imageUrl: product.images?.find(i => i.perspective === 'front')
          ?.sizes?.find(s => s.size === 'medium')?.url || null,
      };
    });

    return res.status(200).json({ products });

  } catch (err) {
    console.error('Kroger API error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}