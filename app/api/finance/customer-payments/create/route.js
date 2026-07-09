export const dynamic = "force-dynamic";
import {
  postCustomerPaymentCommand,
} from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

export default async function handler(req, res) {
  try {
    const body = req.body;

    const result =
      await postCustomerPaymentCommand(
        body
      );

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
