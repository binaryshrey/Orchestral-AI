// app/support/page.tsx
import { withAuth } from "@workos-inc/authkit-nextjs";
import DashboardLayout from "@/components/DashboardLayout";

export default async function SupportPage() {
  const { user } = await withAuth();

  if (!user) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Not signed in</h1>
        <p>You should have been redirected. Try going back to the homepage.</p>
      </main>
    );
  }

  return (
    <DashboardLayout user={user} currentPage="support">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Support</h1>
        <p className="mt-2 text-gray-600">
          Get help with your account and questions
        </p>

        <div className="mt-8 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  How do I practice my pitch?
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Navigate to the Pitch Simulation page from the main menu. You
                  can start a new session and practice with our AI-powered
                  feedback system.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  How do I view my feedback history?
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Go to the Feedback page to see all your past sessions, scores,
                  and detailed feedback on your presentations.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  Can I customize my profile?
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Yes! Click on "View profile" at the bottom of the sidebar to
                  access your profile settings and update your information.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Contact Support
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Need more help? Send us a message and we'll get back to you as
              soon as possible.
            </p>
            <form className="space-y-4">
              <div>
                <label
                  htmlFor="subject"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Subject
                </label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="How can we help?"
                />
              </div>
              <div>
                <label
                  htmlFor="message"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Describe your issue or question..."
                />
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Send Message
              </button>
            </form>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Quick Links
            </h2>
            <div className="space-y-2">
              <a
                href="#"
                className="block text-sm text-indigo-600 hover:text-indigo-800"
              >
                Documentation
              </a>
              <a
                href="#"
                className="block text-sm text-indigo-600 hover:text-indigo-800"
              >
                Video Tutorials
              </a>
              <a
                href="#"
                className="block text-sm text-indigo-600 hover:text-indigo-800"
              >
                Community Forum
              </a>
              <a
                href="#"
                className="block text-sm text-indigo-600 hover:text-indigo-800"
              >
                Report a Bug
              </a>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
