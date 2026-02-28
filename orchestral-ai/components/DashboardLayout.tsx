"use client";

import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Link from "next/link";
import Image from "next/image";
import {
  RiHome6Fill,
  RiFolder2Fill,
  RiSettingsFill,
  RiQuestionFill,
  RiMenuLine,
  RiCloseLine,
} from "@remixicon/react";

interface User {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  profilePictureUrl?: string | null;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: User;
  currentPage: "dashboard" | "files" | "settings" | "support" | "profile";
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function DashboardLayout({
  children,
  user,
  currentPage,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: RiHome6Fill,
      current: currentPage === "dashboard",
    },
    {
      name: "Files",
      href: "/files",
      icon: RiFolder2Fill,
      current: currentPage === "files",
    },
    {
      name: "Settings",
      href: "/settings",
      icon: RiSettingsFill,
      current: currentPage === "settings",
    },
    {
      name: "Support",
      href: "/support",
      icon: RiQuestionFill,
      current: currentPage === "support",
    },
  ];

  return (
    <>
      <div>
        <Transition.Root show={sidebarOpen} as={Fragment}>
          <Dialog
            as="div"
            className="relative z-40 md:hidden"
            onClose={setSidebarOpen}
          >
            <Transition.Child
              as={Fragment}
              enter="transition-opacity ease-linear duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity ease-linear duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
            </Transition.Child>

            <div className="fixed inset-0 z-40 flex">
              <Transition.Child
                as={Fragment}
                enter="transition ease-in-out duration-300 transform"
                enterFrom="-translate-x-full"
                enterTo="translate-x-0"
                leave="transition ease-in-out duration-300 transform"
                leaveFrom="translate-x-0"
                leaveTo="-translate-x-full"
              >
                <Dialog.Panel className="relative flex w-full max-w-xs flex-1 flex-col bg-white">
                  <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <div className="absolute top-0 right-0 -mr-12 pt-2">
                      <button
                        type="button"
                        className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                        onClick={() => setSidebarOpen(false)}
                      >
                        <span className="sr-only">Close sidebar</span>
                        <RiCloseLine
                          className="h-6 w-6 text-white"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </Transition.Child>
                  <div className="h-0 flex-1 overflow-y-auto pt-4 pb-4">
                    <div className="flex shrink-0 items-center px-4">
                      <Image
                        className="h-8 w-auto"
                        src="/logo-dark.svg"
                        alt="Orchestral AI"
                        width={32}
                        height={32}
                      />
                      <p className="text-xl pl-4 font-semibold text-gray-900">
                        Orchestral AI
                      </p>
                    </div>
                    <nav className="mt-5 space-y-1 px-2">
                      {navigation.map((item) =>
                        item.name === "Support" ? (
                          <a
                            key={item.name}
                            href="https://github.com/binaryshrey/Orchestral-AI/issues"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={classNames(
                              item.current
                                ? "bg-[#fc7249] text-white"
                                : "text-gray-600 hover:bg-[#ffeee9] hover:text-gray-600",
                              "group flex items-center px-2 py-2 text-base font-medium rounded-md",
                            )}
                          >
                            <item.icon
                              className={classNames(
                                item.current
                                  ? "text-white"
                                  : "text-gray-600 group-hover:text-gray-600",
                                "mr-4 shrink-0 h-6 w-6",
                              )}
                              aria-hidden="true"
                            />
                            {item.name}
                          </a>
                        ) : (
                          <Link
                            key={item.name}
                            href={item.href}
                            className={classNames(
                              item.current
                                ? "bg-[#fc7249] text-white"
                                : "text-gray-600 hover:bg-[#ffeee9] hover:text-gray-600",
                              "group flex items-center px-2 py-2 text-base font-medium rounded-md",
                            )}
                          >
                            <item.icon
                              className={classNames(
                                item.current
                                  ? "text-white"
                                  : "text-gray-600 group-hover:text-gray-600",
                                "mr-4 shrink-0 h-6 w-6",
                              )}
                              aria-hidden="true"
                            />
                            {item.name}
                          </Link>
                        ),
                      )}
                    </nav>
                  </div>
                  <div className="flex shrink-0 border-t border-gray-200 p-4">
                    <Link
                      href="/profile"
                      className="group block w-full shrink-0"
                    >
                      <div className="flex items-center">
                        <div>
                          <Image
                            className="inline-block h-10 w-10 rounded-full"
                            src={
                              user?.profilePictureUrl || "/default-avatar.png"
                            }
                            alt=""
                            width={40}
                            height={40}
                          />
                        </div>
                        <div className="ml-3">
                          <p className="text-base font-medium text-gray-700 group-hover:text-gray-900">
                            {user?.firstName} {user?.lastName}
                          </p>
                          <p className="text-sm font-medium text-gray-500 group-hover:text-gray-700">
                            View profile
                          </p>
                        </div>
                      </div>
                    </Link>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
              <div className="w-14 shrink-0">
                {/* Force sidebar to shrink to fit close icon */}
              </div>
            </div>
          </Dialog>
        </Transition.Root>

        {/* Static sidebar for desktop */}
        <div className="hidden md:fixed md:inset-y-0 md:flex md:w-60 md:flex-col">
          {/* Sidebar component, swap this element with another sidebar if you like */}
          <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white">
            <div className="flex flex-1 flex-col overflow-y-auto pt-4 pb-4">
              <div className="flex shrink-0 items-center px-4">
                <Image
                  className="h-8 w-auto"
                  src="/logo-dark.svg"
                  alt="Orchestral AI"
                  width={32}
                  height={32}
                />
                <p className="text-xl pl-4 font-semibold text-gray-900">
                  Orchestral AI
                </p>
              </div>
              <nav className="mt-5 flex-1 space-y-1 px-2">
                {navigation.map((item) =>
                  item.name === "Support" ? (
                    <a
                      key={item.name}
                      href="https://github.com/binaryshrey/Orchestral-AI/issues"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={classNames(
                        item.current
                          ? "bg-[#fc7249] text-white"
                          : "text-gray-600 hover:bg-[#ffeee9] hover:text-gray-600",
                        "group flex items-center px-2 py-2 text-sm font-medium rounded-md",
                      )}
                    >
                      <item.icon
                        className={classNames(
                          item.current
                            ? "text-white"
                            : "text-gray-600 group-hover:text-gray-600",
                          "mr-4 ml-1 shrink-0 h-5 w-5",
                        )}
                        aria-hidden="true"
                      />
                      {item.name}
                    </a>
                  ) : (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={classNames(
                        item.current
                          ? "bg-[#fc7249] text-white"
                          : "text-gray-600 hover:bg-[#ffeee9] hover:text-gray-600",
                        "group flex items-center px-2 py-2 text-sm font-medium rounded-md",
                      )}
                    >
                      <item.icon
                        className={classNames(
                          item.current
                            ? "text-white"
                            : "text-gray-600 group-hover:text-gray-600",
                          "mr-4 ml-1 shrink-0 h-5 w-5",
                        )}
                        aria-hidden="true"
                      />
                      {item.name}
                    </Link>
                  ),
                )}
              </nav>
            </div>

            <div className="flex shrink-0 border-t border-gray-200 p-4">
              <Link href="/profile" className="group block w-full shrink-0">
                <div className="flex items-center">
                  <div>
                    <Image
                      className="inline-block h-9 w-9 rounded-full"
                      src={user?.profilePictureUrl || "/default-avatar.png"}
                      alt=""
                      width={36}
                      height={36}
                    />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs font-medium text-gray-500 group-hover:text-gray-700">
                      View profile
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col md:pl-59">
          <div className="sticky top-0 z-10 bg-gray-100 pl-1 pt-1 sm:pl-3 sm:pt-3 md:hidden">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="-ml-0.5 -mt-0.5 inline-flex h-12 w-12 items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                onClick={() => setSidebarOpen(true)}
              >
                <span className="sr-only">Open sidebar</span>
                <RiMenuLine className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
          </div>
          <main className="flex-1">
            <div className="py-2">
              <div className="mx-auto max-w-8xl px-1 sm:px-1 md:px-1">
                <div className="py-1 hidden lg:block">{children}</div>
                <div className="py-1 overflow-y-auto lg:hidden">{children}</div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
