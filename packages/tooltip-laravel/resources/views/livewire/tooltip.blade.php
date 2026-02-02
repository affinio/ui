@props([
    'tooltipId',
    'openDelay',
    'closeDelay',
    'placement',
    'align',
    'gutter',
    'strategy',
    'triggerMode' => 'hover-focus',
])

<div
    {{ $attributes->merge([
        'data-affino-tooltip-root' => $tooltipId,
        'data-affino-tooltip-placement' => $placement,
        'data-affino-tooltip-align' => $align,
        'data-affino-tooltip-gutter' => $gutter,
        'data-affino-tooltip-strategy' => $strategy,
        'data-affino-tooltip-open-delay' => $openDelay,
        'data-affino-tooltip-close-delay' => $closeDelay,
        'data-affino-tooltip-state' => 'closed',
        'data-affino-tooltip-trigger-mode' => $triggerMode,
    ]) }}
>
    <div data-affino-tooltip-trigger>
        {{ $trigger ?? '' }}
    </div>

    <div data-affino-tooltip-surface data-state="closed" hidden>
        {{ $slot }}
    </div>
</div>
