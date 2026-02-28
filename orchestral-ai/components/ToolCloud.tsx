export default function ToolCloud() {
  return (
    <div className="bg-white my-24 sm:my-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="text-center text-lg/8 font-medium text-gray-900">
          Built with best-in-class AI and cloud infrastructure
        </h2>
        <div className="mx-auto mt-10 grid max-w-lg grid-cols-4 items-center gap-x-8 gap-y-10 sm:max-w-xl sm:grid-cols-6 sm:gap-x-10 lg:mx-0 lg:max-w-none lg:grid-cols-5">
          <div className="col-span-2 flex items-center justify-center h-12 lg:col-span-1">
            <img
              alt="Next.js"
              src="/next.svg"
              className="h-6 w-auto object-contain"
            />
          </div>
          <div className="col-span-2 flex items-center justify-center h-12 lg:col-span-1">
            <img
              alt="FastAPI"
              src="/fastapi.svg"
              className="h-6 w-auto object-contain"
            />
          </div>
          <div className="col-span-2 flex items-center justify-center h-12 lg:col-span-1">
            <img
              alt="Google Cloud"
              src="/googlecloud.svg"
              className="h-7 w-auto object-contain"
            />
          </div>
          <div className="col-span-2 flex items-center justify-center h-12 sm:col-start-2 lg:col-span-1">
            <img
              alt="Anam"
              src="/anam.svg"
              className="h-6 w-auto object-contain"
            />
          </div>
          <div className="col-span-2 col-start-2 flex items-center justify-center h-12 sm:col-start-auto lg:col-span-1">
            <img
              alt="ElevenLabs"
              src="/elevenlabs.svg"
              className="h-6 w-auto object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
