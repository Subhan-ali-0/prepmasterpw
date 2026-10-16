const SOURCE = "https://studystark.github.io/batches/batches.json";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const response = await fetch(SOURCE, {
      headers: {
        Accept: "application/json",
        "User-Agent": "PrepMaster/1.0"
      },
      signal: AbortSignal.timeout(20000)
    });

    const body = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Batch source returned an error",
        status: response.status,
        details: body.slice(0, 500)
      });
    }

    // Confirm the upstream response is valid JSON.
    let data;

    try {
      data = JSON.parse(body);
    } catch {
      return res.status(502).json({
        error: "Batch source did not return valid JSON",
        details: body.slice(0, 300)
      });
    }

    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=120"
    );

    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      error: "Could not load batches",
      message: error.message
    });
  }
}
