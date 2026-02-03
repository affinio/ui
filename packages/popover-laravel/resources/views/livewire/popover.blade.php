@props([
    'popoverId',
    'placement' => 'bottom',
    'align' => 'center',
    'gutter' => 12,
    'viewportPadding' => 20,
    'strategy' => 'fixed',
    'role' => 'dialog',
    'modal' => false,
    'closeOnEscape' => true,
    'closeOnInteractOutside' => true,
    'returnFocus' => true,
    'lockScroll' => false,
    'defaultOpen' => false,
    'pinned' => false,
    'arrowSize' => 12,
    'arrowInset' => 6,
    'arrowOffset' => 6,
])

@php
    $initialState = $defaultOpen ? 'open' : 'closed';
@endphp

<div
    {{ $attributes->merge([
        'data-affino-popover-root' => $popoverId,
        'data-affino-popover-placement' => $placement,
        'data-affino-popover-align' => $align,
        'data-affino-popover-gutter' => $gutter,
        'data-affino-popover-viewport-padding' => $viewportPadding,
        'data-affino-popover-strategy' => $strategy,
        'data-affino-popover-role' => $role,
        'data-affino-popover-modal' => $modal ? 'true' : 'false',
        'data-affino-popover-close-escape' => $closeOnEscape ? 'true' : 'false',
        'data-affino-popover-close-outside' => $closeOnInteractOutside ? 'true' : 'false',
        'data-affino-popover-return-focus' => $returnFocus ? 'true' : 'false',
        'data-affino-popover-lock-scroll' => $lockScroll ? 'true' : 'false',
        'data-affino-popover-arrow-size' => $arrowSize,
        'data-affino-popover-arrow-inset' => $arrowInset,
        'data-affino-popover-arrow-offset' => $arrowOffset,
        'data-affino-popover-pinned' => $pinned ? 'true' : 'false',
        'data-affino-popover-default-open' => $defaultOpen ? 'true' : 'false',
        'data-affino-popover-state' => $initialState,
    ]) }}
>
    <div data-affino-popover-trigger>
        {{ $trigger ?? '' }}
    </div>

    <div data-affino-popover-content data-state="{{ $initialState }}" @class(['is-open' => $defaultOpen]) @unless($defaultOpen) hidden @endunless>
        {{ $slot }}

        @isset($arrow)
            <div data-affino-popover-arrow>
                {{ $arrow }}
            </div>
        @endisset
    </div>
</div>
