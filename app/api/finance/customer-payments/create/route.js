import { financeGateway } from "@/lib/finance/gateway/financeGateway";

export default async function handler(req, res) {
  try {
    const body = req.body;

    const result = await financeGateway({
      type: "PAYMENT_RECEIVED",
      payload: {
        ...body
      }
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
