import generatePayslipPdf
from "@/lib/payroll/payslips/generatePayslipPdf";

export async function POST(
  req
) {

  try {

    const body =
      await req.json();

    const pdf =
      await generatePayslipPdf({

        payrollRecordId:
          body.payrollRecordId,

      });

    return new Response(
      pdf,
      {

        status: 200,

        headers: {

          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            "inline; filename=payslip.pdf",

        },

      }
    );

  } catch (error) {

    return Response.json(

      {

        success: false,

        error:
          error.message,

      },

      {

        status: 500,

      }
    );

  }

}
