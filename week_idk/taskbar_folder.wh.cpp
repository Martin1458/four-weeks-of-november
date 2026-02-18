// ==WindhawkMod==
// @id              taskbar-random-swap
// @name            Taskbar Icon Swapper
// @description     Randomly swaps visual positions of two taskbar icons when clicked
// @version         0.1
// @author          Martin1458
// @github          https://github.com/martin1458
// @include         explorer.exe
// @architecture      x86-64
// @compilerOptions -lole32 -loleaut32 -lruntimeobject -lshcore -lwindowsapp -luser32
// ==/WindhawkMod==

// ==WindhawkModReadme==
/*
# Taskbar Icon Swapper
Clicking anywhere on the taskbar frame will randomly pick two icons and visually swap their positions.
Note: This is a visual trick using XAML transforms; it does not change the actual logical order in Windows.
*/
// ==/WindhawkModReadme==


#undef GetCurrentTime
#include <windhawk_utils.h>
#include <windows.h>
#include <functional>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.UI.Xaml.h>
#include <winrt/Windows.UI.Xaml.Controls.h>
#include <winrt/Windows.UI.Xaml.Input.h>
#include <winrt/Windows.UI.Xaml.Media.h>
#include <vector>
#include <atomic>
#include <algorithm>
#include <random>

using namespace winrt::Windows::UI::Xaml;
using namespace winrt::Windows::UI::Xaml::Media;

// Global State
std::atomic<bool> g_taskbarViewDllLoaded = false;
std::atomic<bool> g_hooksApplied = false;

// Store icon references
struct IconInfo {
    winrt::weak_ref<FrameworkElement> element;
    double originalX;
    double currentShift; // How much we've moved it from originalX
};

std::vector<IconInfo> g_icons;
bool g_iconsInitialized = false;

// Helper to find children
FrameworkElement EnumChildElements(FrameworkElement element, std::function<bool(FrameworkElement)> enumCallback) {
    int childrenCount = VisualTreeHelper::GetChildrenCount(element);
    for (int i = 0; i < childrenCount; i++) {
        auto child = VisualTreeHelper::GetChild(element, i).try_as<FrameworkElement>();
        if (!child) continue;
        if (enumCallback(child)) return child;
    }
    return nullptr;
}

FrameworkElement FindChildByClassNamePartial(FrameworkElement element, PCWSTR partialName) {
    if (!element) return nullptr;
    return EnumChildElements(element, [partialName](FrameworkElement child) {
        auto className = winrt::get_class_name(child);
        return std::wstring_view(className).find(partialName) != std::wstring_view::npos;
    });
}

// Find icons and prepare them for movement
void RefreshIcons(FrameworkElement taskbarFrame) {
    g_icons.clear();
    

    // Forward-declare the lambda for recursion
    std::function<void(FrameworkElement)> recurse;
    recurse = [&](FrameworkElement element) {
        if (!element) return;
        auto className = winrt::get_class_name(element);
        // Found an icon button
        if (std::wstring_view(className).find(L"TaskListButton") != std::wstring_view::npos) {
            // Ensure it has a TranslateTransform
            auto tg = element.RenderTransform().try_as<TransformGroup>();
            if (!tg) {
                tg = TransformGroup();
                element.RenderTransform(tg);
            }
            TranslateTransform moveTransform = nullptr;
            for(auto child : tg.Children()) {
                if(auto t = child.try_as<TranslateTransform>()) {
                    moveTransform = t;
                    break;
                }
            }
            if (!moveTransform) {
                moveTransform = TranslateTransform();
                tg.Children().Append(moveTransform);
            }
            // Calculate global X for sorting
            auto transform = element.TransformToVisual(taskbarFrame);
            auto point = transform.TransformPoint({0, 0});
            g_icons.push_back({
                winrt::make_weak(element),
                point.X,
                moveTransform.X() // Remember current shift if any
            });
        }
        int count = VisualTreeHelper::GetChildrenCount(element);
        for (int i = 0; i < count; i++) {
            auto child = VisualTreeHelper::GetChild(element, i).try_as<FrameworkElement>();
            if (child) recurse(child);
        }
    };

    // Find the container first to optimize
    FrameworkElement repeater = FindChildByClassNamePartial(taskbarFrame, L"TaskbarFrameRepeater");
    if (!repeater) repeater = FindChildByClassNamePartial(taskbarFrame, L"TaskbarItemHost");
    if (repeater) {
        recurse(repeater);
    } else {
        recurse(taskbarFrame);
    }

    // Sort by original X position so indices match visual order (left to right)
    std::sort(g_icons.begin(), g_icons.end(), [](const IconInfo& a, const IconInfo& b) {
        return a.originalX < b.originalX;
    });

    g_iconsInitialized = true;
    Wh_Log(L"Found %d icons", (int)g_icons.size());
}


void PerformRandomSwap() {
    if (g_icons.size() < 2) return;

    // Pick two random indices
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> distrib(0, (int)g_icons.size() - 1);

    int idxA = distrib(gen);
    int idxB = distrib(gen);

    while (idxA == idxB) {
        idxB = distrib(gen); // Ensure they are different
    }

    auto& iconA = g_icons[idxA];
    auto& iconB = g_icons[idxB];

    auto elemA = iconA.element.get();
    auto elemB = iconB.element.get();
    
    if (!elemA || !elemB) return;

    // Calculate the distance between them (original positions)
    // We want A to visually move to B's spot, and B to A's spot.
    
    // Current visual pos = originalX + currentShift
    // Target visual pos for A = B's original X
    // Target visual pos for B = A's original X
    
    double targetPosA = iconB.originalX;
    double targetPosB = iconA.originalX;

    double newShiftA = targetPosA - iconA.originalX;
    double newShiftB = targetPosB - iconA.originalX; // Should rely on swap logic generally 
    
    // Simplification: Just swap their current Visual X offsets? 
    // No, transforms are relative to self.
    // Movement needed for A: (B.OriginalX - A.OriginalX)
    // Movement needed for B: (A.OriginalX - B.OriginalX)

    // Apply via Transform
    auto getTranslate = [](FrameworkElement& el) -> TranslateTransform {
        auto tg = el.RenderTransform().as<TransformGroup>();
        for(auto child : tg.Children()) {
             if(auto t = child.try_as<TranslateTransform>()) return t;
        }
        return nullptr;
    };

    auto transA = getTranslate(elemA);
    auto transB = getTranslate(elemB);

    if (transA && transB) {
        // Swap their visual locations
        // Note: This stack swaps them ON TOP of any existing swaps if we tracked state perfectly,
        // but for simplicity, we just swap their offsets relative to original.
        
        // Actually, to swap A and B:
        // A needs to move by (B_Original - A_Original)
        // B needs to move by (A_Original - B_Original)
        
        // Reset check: if they are already swapped, this logic might get messy without robust state tracking.
        // Simple "Glitch" swap:
        transA.X(iconB.originalX - iconA.originalX);
        transB.X(iconA.originalX - iconB.originalX);
        
        Wh_Log(L"Swapped index %d and %d", idxA, idxB);
    }
}

// Hook Declaration
using TaskbarFrame_OnPointerPressed_t = int(WINAPI*)(void* pThis, void* pArgs);
TaskbarFrame_OnPointerPressed_t TaskbarFrame_OnPointerPressed_Original;

int WINAPI TaskbarFrame_OnPointerPressed_Hook(void* pThis, void* pArgs) {
    auto original = [=]() {
        return TaskbarFrame_OnPointerPressed_Original(pThis, pArgs);
    };

    FrameworkElement element = nullptr;
    ((IUnknown*)pThis)->QueryInterface(winrt::guid_of<FrameworkElement>(), winrt::put_abi(element));

    if (element && winrt::get_class_name(element) == L"Taskbar.TaskbarFrame") {
        // Get pointer event args
        winrt::Windows::UI::Xaml::Input::PointerRoutedEventArgs args{ nullptr };
        if (pArgs) {
            args = *reinterpret_cast<winrt::Windows::UI::Xaml::Input::PointerRoutedEventArgs*>(&pArgs);
        }
        bool handled = false;
        if (args) {
            auto pointer = args.Pointer();
            if (pointer) {
                auto pointerType = pointer.PointerDeviceType();
                // Only check mouse
                if (pointerType == winrt::Windows::Devices::Input::PointerDeviceType::Mouse) {
                    // Get mouse properties
                    auto props = args.GetCurrentPoint(element).Properties();
                    if (props.IsMiddleButtonPressed()) {
                        // Middle click: reset all icon transforms
                        RefreshIcons(element);
                        for (auto& icon : g_icons) {
                            if (auto el = icon.element.get()) {
                                auto tg = el.RenderTransform().try_as<TransformGroup>();
                                if (tg) {
                                    for (auto child : tg.Children()) {
                                        if (auto t = child.try_as<TranslateTransform>()) {
                                            t.X(0);
                                        }
                                    }
                                }
                            }
                        }
                        Wh_Log(L"Taskbar middle-click: reset icon order");
                        handled = true;
                    }
                }
            }
        }
        if (!handled) {
            // Left or other click: swap
            Wh_Log(L"Taskbar Clicked!");
            RefreshIcons(element);
            PerformRandomSwap();
        }
    }

    return original();
}

HMODULE GetTaskbarViewModuleHandle() {
    return GetModuleHandle(L"Taskbar.View.dll");
}

bool HookFunctions(HMODULE module) {
    WindhawkUtils::SYMBOL_HOOK hooks[] = {
        {
            {
                LR"(public: virtual int __cdecl winrt::impl::produce<struct winrt::Taskbar::implementation::TaskbarFrame,struct winrt::Windows::UI::Xaml::Controls::IControlOverrides>::OnPointerPressed(void *))"
            },
            &TaskbarFrame_OnPointerPressed_Original,
            TaskbarFrame_OnPointerPressed_Hook,
        },
    };

    return HookSymbols(module, hooks, ARRAYSIZE(hooks));
}

using LoadLibraryExW_t = decltype(&LoadLibraryExW);
LoadLibraryExW_t LoadLibraryExW_Original;

HMODULE WINAPI LoadLibraryExW_Hook(LPCWSTR lpLibFileName, HANDLE hFile, DWORD dwFlags) {
    HMODULE module = LoadLibraryExW_Original(lpLibFileName, hFile, dwFlags);
    if (!module) return module;

    if (!g_taskbarViewDllLoaded && GetTaskbarViewModuleHandle() == module) {
        if (!g_taskbarViewDllLoaded.exchange(true)) {
             if (HookFunctions(module)) {
                 Wh_ApplyHookOperations();
                 Wh_Log(L"Hooks Applied.");
             }
        }
    }
    return module;
}

BOOL Wh_ModInit() {
    Wh_Log(L"Init");
    if (HMODULE mod = GetTaskbarViewModuleHandle()) {
        g_taskbarViewDllLoaded = true;
        HookFunctions(mod);
    } else {
        WindhawkUtils::SetFunctionHook(
            (void*)GetProcAddress(GetModuleHandle(L"kernelbase.dll"), "LoadLibraryExW"),
            (void*)LoadLibraryExW_Hook,
            (void**)&LoadLibraryExW_Original);
    }
    return TRUE;
}

void Wh_ModUninit() {}
void Wh_ModSettingsChanged() {}