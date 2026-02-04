<?php

namespace Affino\Dialog\Laravel\Support;

final class CloseStrategy
{
    public const BLOCKING = 'blocking';
    public const OPTIMISTIC = 'optimistic';

    public static function normalize(string $value): string
    {
        $normalized = strtolower(trim($value));
        return $normalized === self::OPTIMISTIC ? self::OPTIMISTIC : self::BLOCKING;
    }
}
