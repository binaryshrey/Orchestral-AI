import { NextRequest, NextResponse } from "next/server";
import { sessionQueue } from "@/lib/sessionQueue";
import getRotatedAnamApiKey from "@/lib/keyRotation";

export async function GET(request: NextRequest) {
  // get rotated key from Redis (Upstash) or fallback
  const anamCoachApiKey = await getRotatedAnamApiKey("coach");
  const avatarCoachId = process.env.ANAM_COACH_AVATAR_ID;
  const elevenLabsCoachAgentId = process.env.ELEVENLABS_COACH_AGENT_ID;
  const anamAuthURI = process.env.ANAM_AUTH_URI;

  if (
    !anamCoachApiKey ||
    !avatarCoachId ||
    !elevenLabsCoachAgentId ||
    !anamAuthURI
  ) {
    return NextResponse.json(
      {
        error:
          "Missing environment variables. Check ANAM_COACH_API_KEY, ANAM_COACH_AVATAR_ID, ELEVENLABS_COACH_AGENT_ID, and ANAM_AUTH_URI",
      },
      { status: 500 }
    );
  }

  try {
    // Use queue to manage concurrency
    const queueStatus = sessionQueue.getQueueStatus();
    console.log(`[Feedback API] Queue status:`, queueStatus);

    // Store the token from inside the queue callback
    let anamToken: string | null = null;

    // Wait for our turn in the queue
    const sessionId = await sessionQueue.requestSession(
      "feedback",
      async () => {
        console.log("[Feedback API] Fetching Anam token...");
        const response = await fetch(anamAuthURI, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anamCoachApiKey}`,
          },
          body: JSON.stringify({
            personaConfig: {
              avatarId: avatarCoachId,
              enableAudioPassthrough: true,
            },
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error("Anam API error (coach avatar):", error);
          throw new Error("Failed to get Anam session token for coach");
        }

        const data = await response.json();
        anamToken = data.sessionToken; // Store the token
        console.log("[Feedback API] Token acquired successfully");
        return data.sessionToken;
      }
    );

    console.log("[Feedback API] Session ID:", sessionId);

    if (!anamToken) {
      throw new Error("Failed to acquire Anam token");
    }

    // Return the token and session ID for cleanup
    return NextResponse.json({
      anamSessionToken: anamToken,
      elevenLabsAgentId: elevenLabsCoachAgentId,
      queueSessionId: sessionId, // For cleanup
    });
  } catch (error) {
    console.error("Config error (coach):", error);
    return NextResponse.json(
      { error: "Failed to get feedback session config" },
      { status: 500 }
    );
  }
}

// Add endpoint to release session when done
export async function DELETE(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    if (sessionId) {
      sessionQueue.releaseSession(sessionId);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json(
      { error: "No session ID provided" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error releasing session:", error);
    return NextResponse.json(
      { error: "Failed to release session" },
      { status: 500 }
    );
  }
}
