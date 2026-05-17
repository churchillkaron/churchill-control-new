export const dynamic = "force-dynamic";

export async function GET() {

  try {

    return Response.json({
      success: true,
      profit: 0,
    });

  } catch (error) {

    console.error(error);

    return Response.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
